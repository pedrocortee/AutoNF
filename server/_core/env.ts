export const ENV = {
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  encryptionKey: process.env.ENCRYPTION_KEY ?? "",
  clerkSecretKey: process.env.CLERK_SECRET_KEY ?? "",
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: parseInt(process.env.PORT ?? "3000", 10),
  publicUrl: process.env.PUBLIC_URL ?? "http://localhost:3000",
};
