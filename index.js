const edge = require('edge-js');
const newConnection = edge.func(__dirname + '/Data.cs');

const COMMAND_TYPES = {
    QUERY: 'query',
    SCALAR: 'scalar',
    COMMAND: 'command',
    PROCEDURE: 'procedure',
    PROCEDURE_SCALAR: 'procedure_scalar'
};

const PARAMETER_DIRECTIONS = {
    INPUT: 1,
    OUTPUT: 2,
    INPUT_OUTPUT: 3,
    RETURN_VALUE: 6
};

const CONNECTION_TYPES = {
    OLEDB: 'oledb',
    SQL: 'sql',
    ODBC: 'odbc'
};

class Connection {
    #edgeConnection

    constructor(constring, contype) {
        if (constring == null || constring.trim() === '')
            throw new Error('constring must not be null or empty');
        if (contype == null || contype.trim() === '')
            contype = CONNECTION_TYPES.OLEDB;

        this.connectionString = constring;
        this.connectionType = contype;

        this.#edgeConnection = newConnection({
            constring,
            contype
        }, true);
    }

    close() {
        this.#edgeConnection.close(null, true);
    }

    transaction(commands) {
        if (!commands)
            return Promise.reject('The commands argument is required.');
        if (!Array.isArray(commands))
            return Promise.reject('Commands argument must be an array type.');
        if (commands.length === 0)
            return Promise.reject('There must be more than one transaction to execute.');

        for (let i = 0; i < commands.length; i++) {
            let command = commands[i];

            if (!command)
                return Promise.reject("Command object must be defined.")
            if (command.query == null || command.query.length === 0)
                return Promise.reject('Command string cannot be null or empty.');
            if (command.params != null && !Array.isArray(command.params))
                command.params = [command.params];

            if (command.params) {
                if (!Array.isArray(command.params))
                    return Promise.reject('Params must be an array type.');

                for (let i = 0; i < command.params.length; i++) {
                    if (Array.isArray(command.params[i]))
                        return Promise.reject('Params cannot contain sub-arrays.');
                }
            }
            else
                command.params = [];
        }

        return new Promise((resolve, reject) => {
            this.#edgeConnection.run({
                commands
            }, (err, data) => {
                if (err)
                    return reject(err);

                return resolve(data);
            });
        });
    }

    query(command, params) {
        return this.transaction([
            {
                query: command,
                params: params,
                type: COMMAND_TYPES.QUERY
            }
        ]);
    }

    scalar(command, params) {
        return this.transaction([
            {
                query: command,
                params: params,
                type: COMMAND_TYPES.SCALAR
            }
        ]);
    }

    execute(command, params) {
       return this.transaction([
            {
                query: command,
                params: params,
                type: COMMAND_TYPES.COMMAND
            }
        ]);
    }

    procedure(command, params) {
        return this.transaction([
            {
                query: command,
                params: params,
                type: COMMAND_TYPES.PROCEDURE
            }
        ]);
    }

    procedureScalar(command, params) {
        return this.transaction([
            {
                query: command,
                params: params,
                type: COMMAND_TYPES.PROCEDURE_SCALAR
            }
        ]);
    }
}

module.exports = {
    COMMAND_TYPES: COMMAND_TYPES,
    PARAMETER_DIRECTIONS: PARAMETER_DIRECTIONS,

    oledbConnection(connectionString) {
        return new Connection(connectionString, CONNECTION_TYPES.OLEDB);
    },
    odbcConnection(connectionString) {
        return new Connection(connectionString, CONNECTION_TYPES.ODBC);
    },
    sqlConnection(connectionString) {
        return new Connection(connectionString, CONNECTION_TYPES.SQL);
    }
};