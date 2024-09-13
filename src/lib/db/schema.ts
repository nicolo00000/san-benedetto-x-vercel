import { pgTable, serial, text, timestamp, varchar, integer} from 'drizzle-orm/pg-core';

// userSubscriptions table
export const userSubscriptions = pgTable('user_subscriptions', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id', { length: 256 }).notNull(),
  stripeCustomerId: varchar('stripe_customer_id', { length: 256 }).notNull(),
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 256 }).notNull(),
  stripePriceId: varchar('stripe_price_id', { length: 256 }).notNull(),
  stripeCurrentPeriodEnd: timestamp('stripe_current_period_end').notNull(),
});

export const userFiles = pgTable('user_files', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id', { length: 256 }).notNull(),
  fileName: varchar('file_name', { length: 256 }).notNull(),
  fileType: varchar('file_type', { length: 50 }).notNull(),
  fileData: text('file_data').notNull(),  // Store file data as base64-encoded string
  machineName: varchar('machine_name', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// carts table
export const carts = pgTable('carts', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id', { length: 256 }).notNull(),
  quantity: integer('quantity').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
