"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

type MmStepperInputProps = {
  id: string;
  value: number;
  min?: number;
  max?: number;
  /** Обычный шаг (стрелки, кнопки) */
  step?: number;
  /** Крупный шаг при Shift + стрелка */
  stepCoarse?: number;
  onValueChange: (next: number) => void;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * Поле размера в мм: кнопки ▲▼ и стрелки вверх/вниз на клавиатуре (Shift — шаг крупнее).
 * Разрешает свободный ввод, фиксирует значение при blur.
 */
export function MmStepperInput({
  id,
  value,
  min = 30,
  max = 5000,
  step = 1,
  stepCoarse = 10,
  onValueChange
}: MmStepperInputProps) {
  const safe = Number.isFinite(value) ? value : min;
  const [local, setLocal] = useState(String(safe));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setLocal(String(safe));
  }, [safe]);

  function bump(delta: number) {
    const next = clamp(safe + delta, min, max);
    onValueChange(next);
    setLocal(String(next));
  }

  function commit() {
    focusedRef.current = false;
    const n = Number(local);
    const next = Number.isFinite(n) ? clamp(n, min, max) : min;
    onValueChange(next);
    setLocal(String(next));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      bump(e.shiftKey ? stepCoarse : step);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      bump(e.shiftKey ? -stepCoarse : -step);
    } else if (e.key === "Enter") {
      commit();
    }
  }

  return (
    <div className="input-stepper">
      <input
        id={id}
        className="input input-stepper__field"
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        autoComplete="off"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onFocus={() => { focusedRef.current = true; }}
        onBlur={commit}
        onKeyDown={onKeyDown}
        title="Стрелки ↑↓: ±1 мм. Shift+стрелки: ±10 мм."
      />
      <div className="input-stepper__spin" role="group" aria-label="Изменить на 1 мм">
        <button
          type="button"
          className="input-stepper__btn"
          tabIndex={-1}
          aria-label="Увеличить на 1 мм"
          onClick={() => bump(step)}
        >
          ▲
        </button>
        <button
          type="button"
          className="input-stepper__btn"
          tabIndex={-1}
          aria-label="Уменьшить на 1 мм"
          onClick={() => bump(-step)}
        >
          ▼
        </button>
      </div>
    </div>
  );
}
