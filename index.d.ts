export function oledbConnection(connectionString: string): Connection;
export function odbcConnection(connectionString: string): Connection;
export function sqlConnection(connectionString: string): Connection;

declare class Connection {
    constructor(constring: string, contype: string | null);

    query(
        command: string,
        params?: CommandParameter | CommandParameter[]
    ): CommandResult<ResultSet>;
    scalar(
        command: string,
        params?: CommandParameter | CommandParameter[]
    ): CommandResult<FieldValue>;
    execute(
        command: string,
        params?: CommandParameter | CommandParameter[]
    ): CommandResult<number>;
    procedure(
        command: string,
        params?: CommandParameter | CommandParameter[]
    ): CommandResult<number>;
    procedureScalar(
        command: string,
        params?: CommandParameter | CommandParameter[]
    ): CommandResult<unknown>;
    transaction(commands: CommandData[]): CommandResult<FieldValue>;
}

type CommandParameter = unknown | CommandParameterOptions;

interface CommandParameterOptions {
    name?: string;
    value?: unknown;
    direction?: ParameterDirection;
    isNullable?: boolean;
    precision?: Uint8Array;
    scale?: Uint8Array;
    size?: Uint8Array;
}

interface CommandData {
    query: string;
    params?: CommandParameter | CommandParameter[];
    type?: CommandType = CommandType.Command;
}

type FieldValue = string | boolean | number | Date | null;
type ResultSet = Record<FieldValue>[][];
interface CommandResult<Result> {
    query: string;
    type: CommandType;
    params: QueryParameter[];
    result: Result;
}

export enum CommandType {
    Query = "query",
    Scalar = "scalar",
    Command = "command",
    Procedure = "procedure",
    ProcedureScalar = "procedure_scalar",
}

export enum ParameterDirection {
    Input = 1,
    Output = 2,
    InputOutput = 3,
    ReturnValue = 6,
}
