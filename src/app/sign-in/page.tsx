import { authConfigured } from "@/lib/auth";
import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  return <div className="content"><SignInForm configured={authConfigured()} /></div>;
}
