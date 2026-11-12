"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { Search } from "lucide-react";
import { InputGroup } from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useUiText } from "@/components/locale/LocaleProvider";
import { checkedListJson, readRequest } from "@/lib/http/request-state";

type Option = { id: string };
type SelectField = { id?: string; name?: string; value: string; onChange: (event: ChangeEvent<HTMLSelectElement>) => void };

/** One page of matches for a picker: the server searches, so a large catalogue is never loaded to fill a <select>. */
export function recordOptionsUrl(path: string, search: string, extra: Record<string, string> = {}) {
  return `${path}?${new URLSearchParams({ ...extra, search: search.trim(), limit: "20" })}`;
}

/**
 * SKAI-1820: a search box and a select of at most 20 server matches. It mounts with the add form, so opening the
 * tab or saving a record never reads the catalogue; the chosen record stays listed while the search changes.
 */
export function RecordSearchSelect<T extends Option>({ path, extra, field, optionLabel, placeholder, className }: {
  path: string;
  extra?: Record<string, string>;
  field: SelectField;
  optionLabel: (row: T) => string;
  placeholder: string;
  className?: string;
}) {
  const ui = useUiText();
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<T[]>([]);
  const [chosen, setChosen] = useState<T | null>(null);
  const extraKey = JSON.stringify(extra ?? {});

  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      try {
        const json = await checkedListJson(await readRequest(recordOptionsUrl(path, search, JSON.parse(extraKey))));
        if (live) setOptions(Array.isArray(json.data) ? json.data : []);
      } catch {
        if (live) setOptions([]);
      }
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [path, search, extraKey]);

  const kept = chosen && chosen.id === field.value && !options.some((row) => row.id === chosen.id) ? [chosen, ...options] : options;
  const onChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setChosen(kept.find((row) => row.id === event.target.value) ?? null);
    field.onChange(event);
  };

  return (
    <div className="flex flex-col gap-1">
      <InputGroup className="relative">
        <Search data-field-affix="start" className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
        <Input className={`${className ?? ""} ps-9`} type="search" aria-label={ui(placeholder)} placeholder={ui(placeholder)} value={search} onChange={(event) => setSearch(event.target.value)} />
      </InputGroup>
      <Select className={className} {...field} onChange={onChange}>
        <option value="">{ui("Select…")}</option>
        {kept.map((row) => <option key={row.id} value={row.id}>{optionLabel(row)}</option>)}
      </Select>
    </div>
  );
}
