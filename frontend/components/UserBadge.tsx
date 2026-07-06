import { getSessionUser } from "@/lib/auth";
import { UserMenu } from "@/components/UserMenu";

/** Server-wrapper: hämtar inloggad användare från backend-sessionen och visar
 *  avatar-menyn. Renderar inget i access_code-läget eller utloggad (login-sidan). */
export async function UserBadge() {
  const user = await getSessionUser();
  if (!user) return null;
  return <UserMenu user={{ name: user.name, email: user.email, role: user.role }} />;
}
