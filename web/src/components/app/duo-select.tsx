// A Duolingo-desktop style picker: a chunky 2px-bordered button with a bold label and chevron that
// opens the app's standard menu. One component for every dropdown selector.
import type { Key } from "react";
import { ChevronDown } from "@/components/app/ic";
import { Button as AriaButton } from "react-aria-components";
import { POP } from "@/components/app/app-sidebar";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { cx } from "@/utils/cx";

export type DuoOption = { id: string; label: string; note?: string; disabled?: boolean };

export const DuoSelect = ({
    label,
    value,
    items,
    onChange,
    className,
    menuClassName,
    placement = "bottom left",
}: {
    label: string;
    value: string;
    items: DuoOption[];
    onChange: (id: string) => void;
    className?: string;
    menuClassName?: string;
    placement?: "bottom left" | "bottom right";
}) => {
    const cur = items.find((i) => i.id === value) || items[0];
    return (
        <Dropdown.Root>
            <AriaButton
                aria-label={label}
                className={cx(
                    "group flex items-center justify-between gap-3 rounded-2xl border-2 border-secondary bg-primary px-4 py-2.5 text-left text-md font-bold text-primary outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2 focus-visible:outline-offset-2 pressed:bg-secondary",
                    className,
                )}
            >
                <span className="truncate">{cur?.label}</span>
                <ChevronDown aria-hidden="true" className="size-5 shrink-0 stroke-[2.5px] text-fg-quaternary transition duration-200 ease-out group-aria-expanded:-scale-y-100" />
            </AriaButton>
            <Dropdown.Popover placement={placement} className={cx("max-h-80! w-(--trigger-width) min-w-44", POP, menuClassName)}>
                <Dropdown.Menu
                    aria-label={label}
                    selectionMode="single"
                    disallowEmptySelection
                    selectedKeys={[value]}
                    disabledKeys={items.filter((i) => i.disabled).map((i) => i.id)}
                    onSelectionChange={(k) => onChange(String([...(k as Set<Key>)][0]))}
                    items={items}
                >
                    {(o) => <Dropdown.Item id={o.id} label={o.label} addon={o.note} />}
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown.Root>
    );
};
