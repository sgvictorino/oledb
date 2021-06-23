export function oledbConnection(connectionString: string): Connection;
export function odbcConnection(connectionString: string): Connection;
export function sqlConnection(connectionString: string): Connection;

declare class Connection {
    constructor(constring: string, contype: string | null);

    async query(
        command: string,
        params?: CommandParameter | CommandParameter[]
    ): Promise<CommandResult<ResultSet>>;
    async scalar(
        command: string,
        params?: CommandParameter | CommandParameter[]
    ): Promise<CommandResult<FieldValue>>;
    async execute(
        command: string,
        params?: CommandParameter | CommandParameter[]
    ): Promise<CommandResult<number>>;
    async procedure(
        command: string,
        params?: CommandParameter | CommandParameter[]
    ): Promise<CommandResult<number>>;
    async procedureScalar(
        command: string,
        params?: CommandParameter | CommandParameter[]
    ): Promise<CommandResult<unknown>>;
    async transaction(
        commands: CommandData[]
    ): Promise<CommandResult<FieldValue>>;
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
