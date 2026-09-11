ALTER TABLE email_deliveries ADD COLUMN message jsonb;
--> statement-breakpoint
CREATE UNIQUE INDEX email_delivery_intent_once ON email_deliveries(order_id, template) WHERE message IS NOT NULL;
