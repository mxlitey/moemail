import { createDb } from "@/lib/db";
import { roles, userRoles } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { ROLES } from "@/lib/permissions";
import { assignRoleToUser } from "@/lib/auth";
import { insertSystemMessage } from "@/lib/system-inbox";

export const runtime = "edge";

const ROLE_LABELS: Record<string, string> = {
  emperor: "皇帝",
  duke: "公爵",
  knight: "骑士",
  civilian: "平民",
};

export async function POST(request: Request) {
  try {
    const { userId, roleName } = await request.json() as { 
      userId: string, 
      roleName: typeof ROLES.DUKE | typeof ROLES.KNIGHT | typeof ROLES.CIVILIAN 
    };
    if (!userId || !roleName) {
      return Response.json(
        { error: "缺少必要参数" },
        { status: 400 }
      );
    }

    if (![ROLES.DUKE, ROLES.KNIGHT, ROLES.CIVILIAN].includes(roleName)) {
      return Response.json(
        { error: "角色不合法" },
        { status: 400 }
      );
    }

    const db = createDb();

    const currentUserRole = await db.query.userRoles.findFirst({
      where: eq(userRoles.userId, userId),
      with: {
        role: true,
      },
    });

    if (currentUserRole?.role.name === ROLES.EMPEROR) {
      return Response.json(
        { error: "不能降级皇帝" },
        { status: 400 }
      );
    }

    let targetRole = await db.query.roles.findFirst({
      where: eq(roles.name, roleName),
    });

    if (!targetRole) {
      const description = {
        [ROLES.DUKE]: "超级用户",
        [ROLES.KNIGHT]: "高级用户",
        [ROLES.CIVILIAN]: "普通用户",
      }[roleName];

      const [newRole] = await db.insert(roles)
        .values({
          name: roleName,
          description,
        })
        .returning();
      targetRole = newRole;
    }

    await assignRoleToUser(db, userId, targetRole.id);

    // 角色直接决定发件配额等权限，变更后通知用户
    const previousRole = currentUserRole?.role.name;
    if (previousRole && previousRole !== roleName) {
      await insertSystemMessage(db, userId, {
        subject: "您的角色已变更",
        content: `您的角色已从「${ROLE_LABELS[previousRole] ?? previousRole}」变更为「${ROLE_LABELS[roleName] ?? roleName}」，发件配额等权限会随之变化。`,
      });
    }

    return Response.json({ 
      success: true,
    });
  } catch (error) {
    console.error("Failed to change user role:", error);
    return Response.json(
      { error: "操作失败" },
      { status: 500 }
    );
  }
}