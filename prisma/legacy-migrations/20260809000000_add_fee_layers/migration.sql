-- CreateTable
CREATE TABLE "fee_types" (
    "id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "fee_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_groups" (
    "id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "fee_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fees_master_lines" (
    "id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "fee_group_id" TEXT NOT NULL,
    "fee_type_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "due_date" TIMESTAMP(3),

    CONSTRAINT "fees_master_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_group_assignments" (
    "id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "fee_group_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "academic_year" INTEGER NOT NULL,

    CONSTRAINT "fee_group_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_discounts" (
    "id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "category_id" TEXT,

    CONSTRAINT "fee_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_discount_assignments" (
    "id" TEXT NOT NULL,
    "discount_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,

    CONSTRAINT "fee_discount_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_carry_forwards" (
    "id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "from_academic_year" INTEGER NOT NULL,
    "to_academic_year" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "note" TEXT,

    CONSTRAINT "fee_carry_forwards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fee_types_campus_id_code_key" ON "fee_types"("campus_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "fee_groups_campus_id_name_key" ON "fee_groups"("campus_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "fees_master_lines_fee_group_id_fee_type_id_key" ON "fees_master_lines"("fee_group_id", "fee_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_group_assignments_fee_group_id_class_id_academic_year_key" ON "fee_group_assignments"("fee_group_id", "class_id", "academic_year");

-- CreateIndex
CREATE UNIQUE INDEX "fee_discounts_campus_id_code_key" ON "fee_discounts"("campus_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "fee_discount_assignments_discount_id_student_id_key" ON "fee_discount_assignments"("discount_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_carry_forwards_student_id_to_academic_year_key" ON "fee_carry_forwards"("student_id", "to_academic_year");

-- AddForeignKey
ALTER TABLE "fees_master_lines" ADD CONSTRAINT "fees_master_lines_fee_group_id_fkey" FOREIGN KEY ("fee_group_id") REFERENCES "fee_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fees_master_lines" ADD CONSTRAINT "fees_master_lines_fee_type_id_fkey" FOREIGN KEY ("fee_type_id") REFERENCES "fee_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fees_master_lines" ADD CONSTRAINT "fees_master_lines_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_group_assignments" ADD CONSTRAINT "fee_group_assignments_fee_group_id_fkey" FOREIGN KEY ("fee_group_id") REFERENCES "fee_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_group_assignments" ADD CONSTRAINT "fee_group_assignments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_group_assignments" ADD CONSTRAINT "fee_group_assignments_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_discounts" ADD CONSTRAINT "fee_discounts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "student_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_discounts" ADD CONSTRAINT "fee_discounts_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_discount_assignments" ADD CONSTRAINT "fee_discount_assignments_discount_id_fkey" FOREIGN KEY ("discount_id") REFERENCES "fee_discounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_discount_assignments" ADD CONSTRAINT "fee_discount_assignments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_carry_forwards" ADD CONSTRAINT "fee_carry_forwards_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_carry_forwards" ADD CONSTRAINT "fee_carry_forwards_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
