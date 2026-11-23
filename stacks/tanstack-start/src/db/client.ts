import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1'

export type Db = DrizzleD1Database

/** Build per request from the D1 binding. Only the composition root and repository tests call this. */
export const createDb = (d1: D1Database): Db => drizzle(d1)
