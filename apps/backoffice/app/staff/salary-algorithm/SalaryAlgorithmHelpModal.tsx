"use client";

import { useEffect, type CSSProperties } from "react";

export function SalaryAlgorithmHelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const sectionTitle: CSSProperties = { margin: "16px 0 8px", fontSize: 15, fontWeight: 700 };
  const p: CSSProperties = { margin: "0 0 10px", fontSize: 14, lineHeight: 1.55, color: "var(--bo-text)" };
  const ul: CSSProperties = { margin: "0 0 10px", paddingLeft: 20, fontSize: 14, lineHeight: 1.55, color: "var(--bo-text)" };
  const muted: CSSProperties = { color: "var(--bo-text-muted)" };

  return (
    <div
      className="bo-modal-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="bo-modal"
        style={{ maxWidth: 720, width: "96vw" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="salary-algo-help-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bo-modal-header">
          <h2 className="bo-modal-title" id="salary-algo-help-title">
            Как считается зарплата
          </h2>
          <button type="button" className="bo-modal-close" aria-label="Закрыть" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="bo-modal-body" style={{ maxHeight: "min(85vh, 820px)", overflowY: "auto" }}>
          <h3 style={{ ...sectionTitle, marginTop: 0 }}>Продавцы</h3>
          <p style={p}>
            В ведомости за период: <strong>ЗП = ставка (₽) + продажи магазина × процент / 100</strong>. Учитываются заказы
            со статусом «Готов» за даты периода; продажи суммируются по магазину сотрудника.
          </p>

          <h3 style={sectionTitle}>Мастер и цех — поля на этой странице</h3>
          <ul style={ul}>
            <li>
              <strong>Ставка, ₽</strong> — фиксированная часть, прибавляется к итогу за период.
            </li>
            <li>
              <strong>K</strong> — коэффициент сложности: умножается на всю переменную часть (сумма начислений по заказам за период), не на ставку.
            </li>
            <li>
              <strong>Доля % (упрощённо)</strong> — если по заказу есть выручка по операциям (тарифы клиента), но сумма оплат мастеру по строкам получилась 0, начисление = эта выручка × доля / 100.
            </li>
            <li>
              <strong>Учитывать (галочка в колонке ✓)</strong> — если операция снята, эта строка не входит в выручку по операциям и в начисление мастеру по заказу (остальные строки считаются как раньше).
            </li>
            <li>
              <strong>Тариф клиента</strong> — цена услуги для клиента за единицу (руб/м.п., руб/м², руб/шт) по строке таблицы операций.
            </li>
            <li>
              <strong>Режим оплаты мастера</strong> — «Процент»: начисление = выручка по операции × (колонка оплаты) / 100. «Фикс»: начисление = (колонка оплаты в ₽ за ед.) × объём.
            </li>
          </ul>

          <h3 style={sectionTitle}>Алгоритм мастера по заказу</h3>
          <p style={p}>
            Считается только <strong>модель по операциям</strong>: выручка по строкам таблицы (тариф клиента × объём) с учётом потолка по сумме заказа, затем начисление мастеру по каждой <strong>включённой</strong> строке (процент или фикс). Строки без галочки «Учитывать» в настройках мастера в расчёт не попадают. Если все тарифы клиента нули и фиксы мастера не дают начисления — по этому заказу 0 ₽ (старый расчёт «пула из снимка» снят).
          </p>

          <h4 style={{ margin: "12px 0 6px", fontSize: 14, fontWeight: 700 }}>Операции и условия</h4>
          <div style={{ overflowX: "auto", marginBottom: 12 }}>
            <table
              className="bo-table"
              style={{ fontSize: 13, width: "100%", minWidth: 560 }}
            >
              <thead>
                <tr>
                  <th>Операция</th>
                  <th>Когда учитывается</th>
                  <th style={{ textAlign: "right" }}>Выручка (тариф × объём)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Сборка рамы (м.п.)</td>
                  <td>Всегда (есть размеры в снимке)</td>
                  <td style={{ textAlign: "right" }}>Тариф за м.п. × периметр рамы</td>
                </tr>
                <tr>
                  <td>Натяжка холста (м²)</td>
                  <td>Задник в снимке — натяжка / подрамник или признак холста</td>
                  <td style={{ textAlign: "right" }}>Тариф за м² × площадь по размерам</td>
                </tr>
                <tr>
                  <td>Стекло (шт)</td>
                  <td>В снимке выбрано стекло, тип не «Нет»</td>
                  <td style={{ textAlign: "right" }}>(Тариф резки + тариф установки) × 1</td>
                </tr>
                <tr>
                  <td>Задник (шт)</td>
                  <td>Есть задник, но не «Нет» и не натяжка/подрамник</td>
                  <td style={{ textAlign: "right" }}>(Тариф резки + тариф установки) × 1</td>
                </tr>
                <tr>
                  <td>Резка окна в паспарту (шт)</td>
                  <td>В снимке есть паспарту (слои, флаг или артикул)</td>
                  <td style={{ textAlign: "right" }}>Тариф за окно × число окон (не меньше 1, если паспарту есть)</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p style={p}>
            <strong>Потолок:</strong> если у заказа известна итоговая сумма, суммарная выручка по операциям не может её превысить: берётся <strong>минимум</strong> из суммы по строкам таблицы и суммы заказа (отдельные операции не пересчитываются по долям — режется только общая сумма выручки по операциям).
          </p>
          <p style={p}>
            <strong>Начисление мастеру по операциям</strong> — для каждой строки отдельно: либо % от выручки этой операции, либо фикс за м.п. / м² / шт, затем всё складывается.
          </p>
          <p style={p}>
            <strong>Упрощённая доля:</strong> выручка по операциям &gt; 0, а сумма начислений по строкам = 0 (все доли и фиксы мастера нули). Тогда начисление за заказ = выручка по операциям × <strong>Доля % (упрощённо)</strong> / 100.
          </p>
          <p style={p}>
            Колонка «Пул работ» в ведомости — сумма выручки по операциям по заказам (с учётом потолка), без отдельного «пула из калькулятора».
          </p>

          <h3 style={sectionTitle}>Какие заказы и кому начисляют</h3>
          <p style={p}>
            В период попадают заказы «Готов»: по дате создания или по дате перехода в «Готов» в истории статусов.
            Если на заказ назначены задачи с сотрудниками — начисление по заказу делится между ними <strong>поровну</strong>. Если никого не назначили — между всеми активными мастерами/цехом магазина заказа, иначе между всеми активными мастерами/цехом в системе.
          </p>

          <h3 style={sectionTitle}>Итог за период (мастер / цех)</h3>
          <p style={p}>
            По каждому сотруднику суммируется переменная часть по всем его долям заказов за период, затем:{" "}
            <strong>ЗП = ставка + (сумма переменной части) × K</strong>. Округление до копеек на шагах — как в расчёте на сервере.
          </p>
          <p style={{ ...p, ...muted, marginBottom: 0 }}>
            Роли «Мастер» и «Цех» в алгоритме одинаковы; отличается только подпись в интерфейсе.
          </p>
        </div>
      </div>
    </div>
  );
}
