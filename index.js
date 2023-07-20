const edge = require('edge-js');
const newConnection = edge.func(__dirname + '/Data.cs');
const { promisify } = require('util');

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

const runFunctions = (transaction, transactionMethod) => {
    const runWithType = (type) => (query, params) =>
        transactionMethod(
            [
                {
                    query,
                    params,
                    type,
                },
            ],
            transaction?.run
        );
    return {
        query: runWithType(COMMAND_TYPES.QUERY),
        scalar: runWithType(COMMAND_TYPES.SCALAR),
        execute: runWithType(COMMAND_TYPES.COMMAND),
        procedure: runWithType(COMMAND_TYPES.PROCEDURE),
        procedureScalar: runWithType(COMMAND_TYPES.PROCEDURE_SCALAR),
    };
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
        this.close = promisify(this.#edgeConnection.close).bind(null, null);
        Object.entries(runFunctions(undefined, this.run.bind(this))).forEach(
            ([name, f]) => (this[name] = f),
        );
    }

    async beginTransaction() {
        const transactionInstance = await promisify(this.#edgeConnection.beginTransaction)(null);
        return {
            commit: promisify(transactionInstance.commit).bind(null, null),
            rollback: promisify(transactionInstance.rollback).bind(null, null),
            ...runFunctions(transactionInstance, this.run),
            run: (commands) =>
                this.run(
                    Array.isArray(commands) ? commands : [commands],
                    transactionInstance.run
                ),
        };
    }

    async transaction(commands) {
        if (typeof commands === "function") {
            const newTransaction = await this.beginTransaction();
            try {
                const result = await commands(newTransaction);
                await newTransaction.commit();
                return result;
            } catch (error) {
                await newTransaction.rollback();
                throw error;
            }
        }

        return this.run(commands, this.#edgeConnection.runAsTransaction);
    }

    async run(commands, run = this.#edgeConnection.run) {
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
            run({
                commands
            }, (err, data) => {
                if (err)
                    return reject(err);

                return resolve(data);
            });
        });
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