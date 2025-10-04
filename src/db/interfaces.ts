/**
 * Database Interfaces
 * 
 * Defines contracts for database operations across the application.
 */

export interface IRepository<T> {
    findOne(options: any): Promise<T | null>;
    find(options?: any): Promise<T[]>;
    save(entity: any, data?: any): Promise<T>;
    delete(entity: any, criteria?: any): Promise<void>;
}

export interface IQueryRunner {
    connect(): Promise<void>;
    startTransaction(): Promise<void>;
    commitTransaction(): Promise<void>;
    rollbackTransaction(): Promise<void>;
    release(): Promise<void>;
    manager: {
        save(entity: any, data: any): Promise<any>;
        delete(entity: any, criteria: any): Promise<void>;
    };
}

export interface IDataSource {
    createQueryRunner(): IQueryRunner;
    getRepository<T>(entity: any): IRepository<T>;
}
