import { User } from "@prisma/client";

export * from "./database/database.module";
export * from "./database/repositories";
export * from "@prisma/client";

export type UserWithOrg = User & {
    activeOrgId: string | null;
    activeOrgRole: string | null;
};
