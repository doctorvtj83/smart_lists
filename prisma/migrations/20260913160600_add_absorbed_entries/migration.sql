-- CreateTable
CREATE TABLE "absorbed_entries" (
    "id" UUID NOT NULL,
    "list_id" UUID NOT NULL,
    "target_item_id" UUID NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "absorbed_entries_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "absorbed_entries" ADD CONSTRAINT "absorbed_entries_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
