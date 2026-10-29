import Link from "next/link"
import { AuthChrome } from "@/components/profile/auth-chrome"
import { AccountSecurity } from "@/components/profile/account-security"
export default function RecoverPage() {
  return <AuthChrome title="Recover your account"><p>Use the recovery code saved at signup or your last password change. Contact your deployment operator if you no longer have it.</p><AccountSecurity recovery /><Link href="/login" className="mt-4 block underline">Back to sign in</Link></AuthChrome>
}
