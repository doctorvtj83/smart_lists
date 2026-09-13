-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "recipe_label_plural" TEXT NOT NULL DEFAULT 'Rezepte',
ADD COLUMN     "recipe_label_singular" TEXT NOT NULL DEFAULT 'Rezept',
ADD COLUMN     "recipes_enabled" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "suggestion_rule_n" SET DEFAULT 3;

-- CreateTable
CREATE TABLE "recipes" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_items" (
    "id" UUID NOT NULL,
    "recipe_id" UUID NOT NULL,
    "catalog_item_id" UUID NOT NULL,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "sort_index" INTEGER NOT NULL,

    CONSTRAINT "recipe_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recipes_project_id_normalized_name_key" ON "recipes"("project_id", "normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_items_recipe_id_catalog_item_id_key" ON "recipe_items"("recipe_id", "catalog_item_id");

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_catalog_item_id_fkey" FOREIGN KEY ("catalog_item_id") REFERENCES "catalog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Slice 18 (spec D8): the raised default only governs NEW projects. Existing projects keep
-- whatever value their row holds, so the change would be invisible on exactly the projects that
-- have enough history for the statistic to matter. Only rows still on the OLD default are moved:
-- a project that was deliberately tuned to some other value is left alone (no UI sets it today,
-- but the migration must not become the thing that overwrites a future manual setting).
UPDATE "projects" SET "suggestion_rule_n" = 3 WHERE "suggestion_rule_n" = 2;
