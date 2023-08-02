export function oledbConnection(connectionString: string): Connection;
export function odbcConnection(connectionString: string): Connection;
export function sqlConnection(connectionString: string): Connection;

type AtLeastOne<T> = AllowReadonly<[T, ...T[]]>;
type AllowReadonly<T> = T | Readonly<T>
type Params = CommandParameter | AllowReadonly<CommandParameter[]>;

type TransactionItem = {
    query: string;
    params?: Params;
    type?: COMMAND_TYPES;
}

type CommandTypeToOutput = {
    query: Record<string, ValueOut>[][];
    command: number;
    procedure: number;
    procedure_scalar: ValueOut;
    scalar: ValueOut;
};
type GetCommandType<C extends TransactionItem> = C["type"] extends COMMAND_TYPES ? C["type"] : COMMAND_TYPES.COMMAND;
type TransactionCommandOutput<C extends TransactionItem> =
    Required<TransactionItem> & { type: GetCommandType<C>, result: CommandTypeToOutput[GetCommandType<C>]; }
type AllTransactionOutput<C extends AtLeastOne<TransactionItem>> =
    Promise<C extends [TransactionItem] ? TransactionCommandOutput<C[0]> : { [I in keyof C] : TransactionCommandOutput<C[I]> }>;

type Transaction = {
    rollback(): Promise<void>;
    commit(): Promise<void>;
} & RunFunctions;

type RunFunctions = {
    run<C extends AtLeastOne<TransactionItem> | TransactionItem>(
        command: C
    ): Promise<C extends TransactionItem ? TransactionCommandOutput<C> : C extends AtLeastOne<TransactionItem> ? AllTransactionOutput<C> : never>;
    query<EntityType = Record<string, ValueOut>>(
        command: string,
        params?: Params
    ): Promise<CommandResult<EntityType[][]>>;
    scalar<FieldType = ValueOut>(
        command: string,
        params?: Params
    ): Promise<CommandResult<FieldType>>;
    execute(
        command: string,
        params?: Params
    ): Promise<CommandResult<number>>;
    procedure(
        command: string,
        params?: Params
    ): Promise<CommandResult<number>>;
    procedureScalar<FieldType = ValueOut>(
        command: string,
        params?: Params
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

type CommandParameter = ValueIn | CommandParameterOptions;

interface CommandParameterOptions {
    name?: string;
    value?: ValueIn;
    direction?: PARAMETER_DIRECTIONS;
    isNullable?: boolean;
    precision?: Uint8Array;
    scale?: Uint8Array;
    size?: Uint8Array;
}

type ValueIn = string | boolean | number | Date | null | undefined;
type ValueOut = Exclude<ValueIn, undefined>;

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
