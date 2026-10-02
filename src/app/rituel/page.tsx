import { redirect } from "next/navigation";
import { ritualYear } from "@/server/context";

export const dynamic = "force-dynamic";

export default function RitualIndex() {
  redirect(`/rituel/${ritualYear()}`);
}
