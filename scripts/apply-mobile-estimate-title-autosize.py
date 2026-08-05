from pathlib import Path


def replace_once(path: Path, old: str, new: str) -> None:
    source = path.read_text(encoding="utf-8")
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one replacement target, found {count}")
    path.write_text(source.replace(old, new), encoding="utf-8")


editor = Path("apps/web/src/features/estimate/EstimateEditor.tsx")
replace_once(
    editor,
    'import { useMemo, useState } from "react";',
    'import { useLayoutEffect, useMemo, useRef, useState } from "react";',
)

component = '''function resizeTextarea(field: HTMLTextAreaElement | null) {
  if (!field) return;
  field.style.maxHeight = "none";
  field.style.height = "0px";
  field.style.height = `${field.scrollHeight}px`;
}

function AutoResizeTextarea({
  id,
  name,
  ariaLabel,
  value,
  onChange
}: {
  id: string;
  name: string;
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const field = fieldRef.current;
    resizeTextarea(field);
    const frame = window.requestAnimationFrame(() => resizeTextarea(field));
    return () => window.cancelAnimationFrame(frame);
  }, [value]);

  return (
    <textarea
      ref={fieldRef}
      id={id}
      name={name}
      aria-label={ariaLabel}
      rows={1}
      value={value}
      onChange={(event) => {
        const field = event.currentTarget;
        onChange(field.value);
        resizeTextarea(field);
      }}
    />
  );
}

'''
replace_once(
    editor,
    "function MobileEditor(props: EditorProps) {",
    component + "function MobileEditor(props: EditorProps) {",
)

old_textarea = '''                    <textarea
                      id={`mobile-name-${item.id}`}
                      name={`mobile-name-${item.id}`}
                      aria-label={`Название позиции ${index + 1}`}
                      rows={2}
                      value={item.name}
                      onChange={(event) => updateItem(section.id, item.id, { name: event.target.value })}
                    />'''
new_textarea = '''                    <AutoResizeTextarea
                      id={`mobile-name-${item.id}`}
                      name={`mobile-name-${item.id}`}
                      ariaLabel={`Название позиции ${index + 1}`}
                      value={item.name}
                      onChange={(value) => updateItem(section.id, item.id, { name: value })}
                    />'''
replace_once(editor, old_textarea, new_textarea)

styles = Path("apps/web/src/styles.css")
old_style = "  .mobile-item-head > input { width: 100%; min-height: 44px; border: 0; background: transparent; padding: 2px 0 0; color: var(--text); font-size: 16px; font-weight: 700; line-height: 1.35; outline: 0; }"
new_style = """  .mobile-item-head > input { width: 100%; min-height: 44px; border: 0; background: transparent; padding: 2px 0 0; color: var(--text); font-size: 16px; font-weight: 700; line-height: 1.35; outline: 0; }
  .mobile-item-head > textarea { width: 100%; min-height: 44px; max-height: none; display: block; overflow: hidden; resize: none; border: 0; background: transparent; padding: 2px 0 0; color: var(--text); font-size: 16px; font-weight: 700; line-height: 1.35; outline: 0; field-sizing: content; }"""
replace_once(styles, old_style, new_style)

mobile_overrides = Path("apps/web/src/mobile-overrides.css")
replace_once(
    mobile_overrides,
    "    max-height: 72px;",
    "    max-height: none;\n    field-sizing: content;",
)

e2e = Path("apps/web/e2e/app.spec.ts")
old_test = '''    const titleField = card.locator("textarea").first();
    const titleGeometry = await titleField.evaluate((element) => ({'''
new_test = '''    const titleField = card.locator("textarea").first();
    if (!external) {
      const longMobileItemName = "Механизированная штукатурка стен по маякам гипсовым составом с подготовкой основания и устройством защитных углов";
      const titleEditResponsePromise = page.waitForResponse((response) =>
        new URL(response.url()).pathname === `/api/estimates/${encodeURIComponent(artifact.id)}` &&
        response.request().method() === "PUT"
      );
      await titleField.fill(longMobileItemName);
      const titleEditResponse = await titleEditResponsePromise;
      expect(titleEditResponse.ok(), await titleEditResponse.text()).toBeTruthy();
      await expect(titleField).toHaveValue(longMobileItemName);
    }
    await expect.poll(
      () => titleField.evaluate((element) => element.scrollHeight <= element.clientHeight + 1),
      { timeout: 5_000, message: "Mobile estimate item title must grow to its full content height" }
    ).toBe(true);
    const titleGeometry = await titleField.evaluate((element) => ({
      maxHeight: getComputedStyle(element).maxHeight,
      inlineHeight: element.style.height,'''
replace_once(e2e, old_test, new_test)

old_assertions = '''    expect(titleGeometry.fontSize).toBeGreaterThanOrEqual(16);
    expect(titleGeometry.scrollWidth).toBeLessThanOrEqual(titleGeometry.clientWidth + 1);
    expect(titleGeometry.scrollHeight).toBeLessThanOrEqual(titleGeometry.clientHeight + 1);'''
new_assertions = '''    expect(titleGeometry.fontSize).toBeGreaterThanOrEqual(16);
    expect(titleGeometry.maxHeight).toBe("none");
    expect(titleGeometry.inlineHeight).not.toBe("");
    expect(titleGeometry.scrollWidth).toBeLessThanOrEqual(titleGeometry.clientWidth + 1);
    expect(titleGeometry.scrollHeight).toBeLessThanOrEqual(titleGeometry.clientHeight + 1);'''
replace_once(e2e, old_assertions, new_assertions)
