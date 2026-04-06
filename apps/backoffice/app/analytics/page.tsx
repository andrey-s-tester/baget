import { redirect } from "next/navigation";

/** Старый путь; раздел перенесён в «Отчёт по продажам». */
export default function AnalyticsRedirectPage() {
  redirect("/reports/sales");
}
