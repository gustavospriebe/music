ALTER TABLE email_deliveries ADD COLUMN production_id uuid;--> statement-breakpoint

-- 0012 grouped old material under a legacy_unverified production. Reuse that
-- grouping only; an old message does not prove it belongs to a new recorded run.
UPDATE email_deliveries e
SET production_id = p.id
FROM orders o JOIN productions p ON p.id = o.current_production_id AND p.order_id = o.id
WHERE e.order_id = o.id AND p.provenance = 'legacy_unverified';--> statement-breakpoint

DROP INDEX email_delivery_intent_once;--> statement-breakpoint
CREATE UNIQUE INDEX email_delivery_intent_once ON email_deliveries(order_id, production_id, template) WHERE message IS NOT NULL;--> statement-breakpoint
ALTER TABLE email_deliveries ADD CONSTRAINT email_deliveries_production_order_fk FOREIGN KEY (production_id, order_id) REFERENCES productions(id, order_id);
