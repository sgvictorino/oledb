export function oledbConnection(connectionString: string): Connection;
export function odbcConnection(connectionString: string): Connection;
export function sqlConnection(connectionString: string): Connection;

type AtLeastOne<T> = [T, ...T[]];

type TransactionItem = {
    query: string;
    params?: CommandParameter | CommandParameter[];
    type?: COMMAND_TYPES;
}

type CommandTypeToOutput = {
    query: Record<string, FieldValue>[][];
    command: number;
    procedure: number;
    procedure_scalar: FieldValue;
    scalar: FieldValue;
};
type GetCommandType<C extends TransactionItem> = C["type"] extends COMMAND_TYPES ? C["type"] : COMMAND_TYPES.COMMAND;
type TransactionCommandOutput<C extends TransactionItem> =
    Required<TransactionItem> & { type: GetCommandType<C>, result: CommandTypeToOutput[GetCommandType<C>]; }
type AllTransactionOutput<C extends AtLeastOne<TransactionItem>> =
    Promise<C extends [TransactionItem] ? TransactionCommandOutput<C[0]> : { [I in keyof C] : TransactionCommandOutput<C[I]> }>;

type Transaction = {
    run<C extends AtLeastOne<TransactionItem> | TransactionItem>(
        command: C
    ): Promise<C extends TransactionItem ? TransactionCommandOutput<C> : C extends AtLeastOne<TransactionItem> ? AllTransactionOutput<C> : never>;
    rollback(): Promise<void>;
    commit(): Promise<void>;
} & RunFunctions;

type RunFunctions = {
    query<EntityType = Record<string, FieldValue>>(
        command: string,
        params?: CommandParameter | CommandParameter[]
    ): Promise<CommandResult<EntityType[][]>>;
    scalar<FieldType = FieldValue>(
        command: string,
        params?: CommandParameter | CommandParameter[]
    ): Promise<CommandResult<FieldType>>;
    execute(
        command: string,
        params?: CommandParameter | CommandParameter[]
    ): Promise<CommandResult<number>>;
    procedure(
        command: string,
        params?: CommandParameter | CommandParameter[]
    ): Promise<CommandResult<number>>;
    procedureScalar<FieldType = FieldValue>(
        command: string,
        params?: CommandParameter | CommandParameter[]
    ): Promise<CommandResult<FieldType>>;
};

declare abstract class ConnectionManagement {
    constructor(constring: string, contype: string | null);

    beginTransaction(): Promise<Transaction>;

    transaction<C extends AtLeastOne<TransactionItem>>(
        commands: C
    ): AllTransactionOutput<C>;

    transaction<Return>(
        callback: (transaction: Transaction) => Promise<Return> | Return
    ): Promise<Return>;

    close(): Promise<void>;
}
declare type Connection = ConnectionManagement & RunFunctions;

type CommandParameter = unknown | CommandParameterOptions;

interface CommandParameterOptions {
    name?: string;
    value?: unknown;
    direction?: PARAMETER_DIRECTIONS;
    isNullable?: boolean;
    precision?: Uint8Array;
    scale?: Uint8Array;
    size?: Uint8Array;
}

type FieldValue = string | boolean | number | Date | null;

interface CommandResult<Result> {
    query: string;
    type: COMMAND_TYPES;
    params: CommandParameter[];
    result: Result;
}

export enum COMMAND_TYPES {
    QUERY = "query",
    SCALAR = "scalar",
    COMMAND = "command",
    PROCEDURE = "procedure",
    PROCEDURE_SCALAR = "procedure_scalar",
}

export enum PARAMETER_DIRECTIONS {
    INPUT = 1,
    OUTPUT = 2,
    INPUT_OUTPUT = 3,
    RETURN_VALUE = 6,
}
