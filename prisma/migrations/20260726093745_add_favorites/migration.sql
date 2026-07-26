-- CreateTable
CREATE TABLE "favorites" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "catalog_item_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "favorites_project_id_catalog_item_id_key" ON "favorites"("project_id", "catalog_item_id");

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_catalog_item_id_fkey" FOREIGN KEY ("catalog_item_id") REFERENCES "catalog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
