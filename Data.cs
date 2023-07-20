//#r "System.dll"
//#r "System.Data.dll"

using System;
using System.Collections.Generic;
using System.Data;
using System.Data.Common;
using System.Data.Odbc;
using System.Data.OleDb;
using System.Data.SqlClient;
using System.Dynamic;
using System.Threading.Tasks;
using System.Linq;
using System.IO;

public class Startup
{
    public async Task<object> Invoke(IDictionary<string, object> parameters)
    {
        JsConnectParameters pcol = new JsConnectParameters(parameters);
        Connection connection = await Connection.NewConnection(pcol.ConnectionString, pcol.ConnectionType);

        Func<object, JsRunParameters> ParseCommandParams = (commandParams) => {
            if (commandParams is IDictionary<string, object>) {
                return new JsRunParameters(commandParams as IDictionary<string, object>);
            }
            throw new ArgumentException("Didn't pass parameters as IDictionary<string, object>");
        };
        Func<object, DbTransaction> ParseTransaction = (transaction) => {
            if (transaction is DbTransaction) {
                return transaction as DbTransaction;
            }
            throw new ArgumentException("Didn't pass transaction as DbTransaction");
        };

        Task<object> emptyTask = Task.FromResult<object>(null);
        return new {
            run = (Func<object, Task<object>>)(
                (commandParams) => {
                    return connection.ExecuteAll(ParseCommandParams(commandParams).Commands);
                }
            ),
            runAsTransaction = (Func<object, Task<object>>)(
                (commandParams) => {
                    return connection.ExecuteTransaction(ParseCommandParams(commandParams).Commands);
                }
            ),
            close = (Func<object, Task<object>>)(
                (_) => {
                    connection.Close();
                    return emptyTask;
                }
            ),
            beginTransaction = (Func<object, Task<object>>)(
                (_) => {
                    DbTransaction transaction = connection.BeginTransaction();
                    return Task.FromResult<object>(new {
                        transaction,
                        run = (Func<object, Task<object>>)(
                            (commandParams) => {
                                return connection.ExecuteTransaction(ParseCommandParams(commandParams).Commands, transaction);
                            }
                        ),
                        commit = (Func<object, Task<object>>)(
                            (__) => {
                                transaction.Commit();
                                return emptyTask;
                            }
                        ),
                        rollback = (Func<object, Task<object>>)(
                            (__) => {
                                transaction.Rollback();
                                return emptyTask;
                            }
                        )
                    });
                }
            )
        };
    }
}

public class Connection
{
    public DbConnection dbConnection;

    private Connection(DbConnection connectionInstance) {
        dbConnection = connectionInstance;
    }

    public static async Task<Connection> NewConnection(string connectionString, JsConnectionTypes type)
    {
        var connectionInstance = type == JsConnectionTypes.oledb ? new OleDbConnection(connectionString) as DbConnection:
                                 type == JsConnectionTypes.odbc ? new OdbcConnection(connectionString) as DbConnection :
                                 type == JsConnectionTypes.sql ? new SqlConnection(connectionString) as DbConnection :
                                 null;
        if (connectionInstance == null) {
            throw new NotImplementedException();
        }

        await connectionInstance.OpenAsync();

        return new Connection(connectionInstance);
    }

    public void Close() {
        dbConnection.Close();
    }

    public DbTransaction BeginTransaction()
    {
        return dbConnection.BeginTransaction(IsolationLevel.ReadCommitted);
    }

    private async Task<object> ExecuteQuery(DbCommand dbCommand, JsCommand jsCommand)
    {
        using (DbDataReader reader = dbCommand.ExecuteReader())
        {
            List<object> results = new List<object>();

            do
            {
                results.Add(await ParseReaderRow(reader));
            }
            while (await reader.NextResultAsync());

            jsCommand.result = results;
        }

        return jsCommand;
    }

    public async Task<object> ExecuteTransaction(List<JsCommand> jsCommands, DbTransaction existingTransaction = null, DbCommand dbCommand = null)
    {
        DbTransaction transaction = existingTransaction ?? dbConnection.BeginTransaction(IsolationLevel.ReadCommitted);
        try
        {
            object result = await ExecuteAll(jsCommands, transaction, dbCommand);
            if (existingTransaction == null)
                transaction.Commit();

            return result;
        }
        catch
        {
            try
            {
                if (existingTransaction == null)
                    transaction.Rollback();
            }
            catch
            {

            }

            throw;
        }
    }

    public async Task<object> ExecuteAll(List<JsCommand> jsCommands, DbTransaction transaction = null, DbCommand dbCommand = null)
    {
        dbCommand = dbCommand ?? dbConnection.CreateCommand();

        if (transaction != null)
            dbCommand.Transaction = transaction;

        object prevResult = null;

        foreach (JsCommand jsCommand in jsCommands)
        {
            try
            {
                dbCommand.CommandText = jsCommand.query;
                AddCommandParameters(dbCommand, jsCommand, prevResult);

                if (new [] { JsQueryTypes.procedure, JsQueryTypes.procedure_scalar }.ToList().Contains(jsCommand.type))
                    dbCommand.CommandType = CommandType.StoredProcedure;

                if (jsCommand.type == JsQueryTypes.query)
                    await ExecuteQuery(dbCommand, jsCommand);
                else if (new [] { JsQueryTypes.command, JsQueryTypes.procedure }.Contains(jsCommand.type))
                    jsCommand.result = await dbCommand.ExecuteNonQueryAsync();
                else if (new [] { JsQueryTypes.scalar, JsQueryTypes.procedure_scalar }.Contains(jsCommand.type))
                    jsCommand.result = await dbCommand.ExecuteScalarAsync();
                else
                    throw new NotSupportedException("Unsupported type of database command. Only 'query', 'scalar', 'command' and 'procedure' are supported.");

                UpdateCommandParameters(dbCommand, jsCommand);
            }
            catch (Exception ex)
            {
                ex.Data.Add("query", jsCommand.query);
                ex.Data.Add("params", jsCommand.@params);
                throw;
            }

            prevResult = jsCommand.result;
        }

        if (jsCommands.Count == 1) return jsCommands[0];

        return jsCommands;
    }

    private async Task<List<object>> ParseReaderRow(DbDataReader reader)
    {
        List<object> rows = new List<object>();
        IDataRecord row = reader;

        while (await reader.ReadAsync())
        {
            var data = new ExpandoObject() as IDictionary<string, object>;
            var result = new object[row.FieldCount];
            row.GetValues(result);

            for (int i = 0; i < row.FieldCount; i++)
            {
                Type type = row.GetFieldType(i);

                if (result[i] is DBNull)
                    result[i] = null;
                else if (type == typeof(byte[]) || type == typeof(char[]))
                    result[i] = Convert.ToBase64String((byte[])result[i]);
                else if (type == typeof(Guid))
                    result[i] = result[i].ToString();
                else if (type == typeof(IDataReader))
                    result[i] = "<IDataReader>";

                data.Add(row.GetName(i), result[i]);
            }

            rows.Add(data);
        }

        return rows;
    }

    private void AddCommandParameters(DbCommand dbCommand, JsCommand jsCommand, object prev = null)
    {
        dbCommand.Parameters.Clear();

        for (int i = 0; i < jsCommand.@params.Count; i++)
        {
            JsCommandParameter cp = jsCommand.@params[i];

            DbParameter param = dbCommand.CreateParameter();
            param.ParameterName = cp.name;

            object paramVal = cp.value;

            //Check if the parameter is a special $prev parameter.
            //If so, then use the prev argument.
            if (paramVal != null && paramVal.ToString().ToLower() == "$prev")
                paramVal = prev;

            if (paramVal == null)
                param.Value = DBNull.Value;
            else
                param.Value = paramVal;

            param.Direction = (ParameterDirection)cp.direction;
            param.IsNullable = cp.isNullable;

            if (cp.precision != null)
                param.Precision = (byte)cp.precision;
            if (cp.scale != null)
                param.Scale = (byte)cp.scale;
            if (cp.size != null)
                param.Size = (byte)cp.size;

            dbCommand.Parameters.Add(param);
        }
    }

    private void UpdateCommandParameters(DbCommand dbCommand, JsCommand jsCommand)
    {
        foreach (DbParameter param in dbCommand.Parameters)
        {
            JsCommandParameter jparam = jsCommand.@params.FirstOrDefault(x => x.name == param.ParameterName);

            if (jparam == null)
                continue;

            jparam.value = param.Value;
        }
    }
}

public enum JsQueryTypes
{
    query,
    scalar,
    command,
    procedure,
    procedure_scalar
}

public enum JsConnectionTypes
{
    oledb,
    odbc,
    sql
}

public abstract class JsParameterCollection {
    protected IDictionary<string, object> _Raw;

    public JsParameterCollection(IDictionary<string, object> parameters)
    {
        if (parameters == null)
            throw new ArgumentNullException("parameters");

        _Raw = parameters;
        ParseRawParameters();
    }

    protected abstract void ParseRawParameters();

    protected bool IsPropertyExist(dynamic settings, string name)
    {
        if (settings is ExpandoObject)
            return ((IDictionary<string, object>)settings).ContainsKey(name);

        return settings.GetType().GetProperty(name) != null;
    }
}

public class JsConnectParameters : JsParameterCollection
{
    public string ConnectionString { get; private set; }
    public JsConnectionTypes ConnectionType { get; private set; }

    public JsConnectParameters(IDictionary<string, object> parameters) : base(parameters)
    {

    }

    protected override void ParseRawParameters()
    {
        //Extract the connection string.
        ConnectionString = _Raw["constring"].ToString();

        if (string.IsNullOrWhiteSpace(ConnectionString))
            throw new ArgumentNullException("constring");

        //Extract the connection type (optional)
        object connectionType = null;

        _Raw.TryGetValue("connection", out connectionType);

        if (connectionType == null)
            connectionType = "oledb";

        ConnectionType = (JsConnectionTypes)Enum.Parse(typeof(JsConnectionTypes), connectionType.ToString().ToLower());
    }
}

public class JsRunParameters : JsParameterCollection
{
    public readonly List<JsCommand> Commands = new List<JsCommand>();

    public JsRunParameters(IDictionary<string, object> parameters) : base(parameters)
    {

    }

    protected override void ParseRawParameters()
    {
        //Extract the commands array.
        dynamic commands = null;

        _Raw.TryGetValue("commands", out commands);

        if (commands == null)
            throw new ArgumentException("The commands field is required.");

        for (int i = 0; i < commands.Length; i++)
        {
            dynamic com = commands[i];

            if (!IsPropertyExist(com, "query"))
                throw new ArgumentException("The query field is required on transaction object.");

            JsCommand newCom = new JsCommand()
            {
                query = com.query
            };

            if (IsPropertyExist(com, "params"))
                newCom.rawParameters = com.@params;
            else
                newCom.rawParameters = new object[] { };

            if (IsPropertyExist(com, "type"))
                newCom.type = (JsQueryTypes)Enum.Parse(typeof(JsQueryTypes), com.type.ToString().ToLower());
            else
                newCom.type = JsQueryTypes.command;

            Commands.Add(newCom);
        }
    }
}

public class JsCommand
{
    public string query { get; set; }
    public JsQueryTypes type { get; set; }
    public List<JsCommandParameter> @params { get; set; }
    public object result { get; set; }

    private object[] _rawParameters;

    internal object[] rawParameters
    {
        get
        {
            return _rawParameters;
        }
        set
        {
            _rawParameters = value;

            @params = new List<JsCommandParameter>();

            //Go through each command parameter and build up the command parameter
            //array. Work out wether to use named parameters (@myParam, @myOtherParam) 
            //or index named parameters (@p1, @p2 ect).
            for (int i = 0; i < _rawParameters.Length; i++)
            {
                dynamic p = _rawParameters[i];
                JsCommandParameter cp = new JsCommandParameter();

                //Check if it is an expando object
                //if it is then extract the name and value from it.
                if (p is ExpandoObject)
                {
                    if (IsPropertyExist(p, "name"))
                        cp.name = p.name.ToString();
                    else
                        cp.name = "p" + (i + 1).ToString();

                    if (IsPropertyExist(p, "value"))
                        cp.value = p.value;
                    else
                        cp.value = null;

                    try { cp.direction = (int)p.direction; } catch { cp.direction = (int)ParameterDirection.Input; }
                    try { cp.isNullable = (bool)p.isNullable; } catch { cp.isNullable = true; }
                    try { cp.precision = (byte)p.precision; } catch { }
                    try { cp.scale = (byte)p.scale; } catch { }
                    try { cp.size = (byte)p.size; } catch { }
                }
                else
                {
                    cp.name = "p" + (i + 1).ToString();
                    cp.value = p;
                }

                @params.Add(cp);
            }
        }
    }

    private bool IsPropertyExist(dynamic obj, string name)
    {
        if (obj is ExpandoObject)
            return ((IDictionary<string, object>)obj).ContainsKey(name);

        return obj.GetType().GetProperty(name) != null;
    }
}

public class JsCommandParameter
{
    public string name { get; set; }
    public object value { get; set; }

    public int direction { get; set; }
    public bool isNullable { get; set; }
    public byte? precision { get; set; }
    public byte? scale { get; set; }
    public byte? size { get; set; }
}