import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_CLERK_ID = "seed-demo-user";
const DEMO_EMAIL = "demo@novadrive.test";
const BULK_COUNT = Number(process.env.SEED_BULK_COUNT ?? 10_000);
const BATCH_SIZE = 1_000;

async function upsertDemoUser() {
  return prisma.user.upsert({
    where: { clerkId: DEMO_CLERK_ID },
    create: { clerkId: DEMO_CLERK_ID, email: DEMO_EMAIL, name: "Demo User" },
    update: {},
  });
}

async function getOrCreateRoot(ownerId: string) {
  const existing = await prisma.folder.findFirst({ where: { ownerId, parentId: null } });
  if (existing) return existing;
  return prisma.folder.create({
    data: { ownerId, name: "My Drive", parentId: null, path: "/", depth: 0 },
  });
}

async function seedSampleTree(ownerId: string, rootId: string, rootPath: string) {
  const photosFolder =
    (await prisma.folder.findFirst({ where: { ownerId, parentId: rootId, name: "Photos" } })) ??
    (await prisma.folder.create({
      data: { ownerId, name: "Photos", parentId: rootId, path: `${rootPath}${rootId}/`, depth: 1 },
    }));

  const documents = await prisma.folder.findFirst({
    where: { ownerId, parentId: rootId, name: "Documents" },
  });
  if (!documents) {
    await prisma.folder.create({
      data: {
        ownerId,
        name: "Documents",
        parentId: rootId,
        path: `${rootPath}${rootId}/`,
        depth: 1,
      },
    });
  }

  const existingFile = await prisma.file.findFirst({ where: { ownerId, folderId: photosFolder.id } });
  if (!existingFile) {
    await prisma.file.create({
      data: {
        name: "sunset.jpg",
        owner: { connect: { id: ownerId } },
        folder: { connect: { id: photosFolder.id } },
        storageObject: {
          create: {
            owner: { connect: { id: ownerId } },
            bucket: "novadrive-dev-stub",
            objectKey: `stub/${ownerId}/${randomUUID()}`,
            contentType: "image/jpeg",
            size: BigInt(2_400_000),
            region: "us-east-1",
          },
        },
      },
    });
  }

  return photosFolder;
}

async function seedBulkFiles(ownerId: string, folderId: string, count: number) {
  const existingCount = await prisma.file.count({ where: { ownerId, folderId } });
  if (existingCount >= count) {
    console.log(`Bulk folder already has ${existingCount} files, skipping.`);
    return;
  }

  const toCreate = count - existingCount;
  console.log(`Seeding ${toCreate} files for pagination performance testing...`);

  for (let batchStart = 0; batchStart < toCreate; batchStart += BATCH_SIZE) {
    const batchSize = Math.min(BATCH_SIZE, toCreate - batchStart);
    const storageObjects = Array.from({ length: batchSize }, (_, i) => ({
      id: randomUUID(),
      ownerId,
      bucket: "novadrive-dev-stub",
      objectKey: `stub/${ownerId}/${randomUUID()}`,
      contentType: "application/octet-stream",
      size: BigInt(1024 + batchStart + i),
      region: "us-east-1",
    }));
    await prisma.storageObject.createMany({ data: storageObjects });

    const files = storageObjects.map((so, i) => ({
      id: randomUUID(),
      name: `stress-file-${String(existingCount + batchStart + i).padStart(6, "0")}.bin`,
      ownerId,
      folderId,
      storageObjectId: so.id,
    }));
    await prisma.file.createMany({ data: files });

    console.log(`  ...${Math.min(batchStart + batchSize, toCreate)}/${toCreate}`);
  }
}

async function main() {
  const user = await upsertDemoUser();
  const root = await getOrCreateRoot(user.id);
  console.log(`Demo user: ${user.email} (${user.id})`);
  console.log(`Root folder: ${root.id}`);

  await seedSampleTree(user.id, root.id, root.path);

  if (process.env.SEED_BULK === "true") {
    const stressFolder =
      (await prisma.folder.findFirst({ where: { ownerId: user.id, parentId: root.id, name: "Stress Test" } })) ??
      (await prisma.folder.create({
        data: {
          ownerId: user.id,
          name: "Stress Test",
          parentId: root.id,
          path: `${root.path}${root.id}/`,
          depth: 1,
        },
      }));
    await seedBulkFiles(user.id, stressFolder.id, BULK_COUNT);
  } else {
    console.log("Skipping bulk seed (set SEED_BULK=true to generate 10k+ synthetic files).");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
