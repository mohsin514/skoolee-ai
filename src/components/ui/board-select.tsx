"use client";

import { GraduationCap } from "lucide-react";
import { OTHER_BOARD, boardsForCountry } from "@/config/boards";
import { Input } from "@/components/ui/input";
import { InputGroup } from "@/components/ui/input-group";
import { Select } from "@/components/ui/select";

/**
 * The one exam-board picker for every campus form (setup, Campus Control,
 * institution settings). The list follows the school's country: national
 * boards, then international ones, then "Other". "Other", or a saved board
 * that is not on this country's list, shows a name field, so an existing
 * campus never loses its board when the list changes.
 *
 * `value` "" means "the country's first board" (what a new campus starts with).
 */
export type BoardSelectProps = {
  id: string;
  /** ISO alpha-2 ("" when unknown). */
  country: string;
  value: string;
  onChange(board: string): void;
  nameLabel: string;
  namePlaceholder: string;
  describedBy?: string;
  disabled?: boolean;
  /** Extra classes for the select's field surface (e.g. a tinted settings field). */
  surfaceClassName?: string;
};

export function BoardSelect({ id, country, value, onChange, nameLabel, namePlaceholder, describedBy, disabled, surfaceClassName }: BoardSelectProps) {
  const boards = boardsForCountry(country);
  const board = value || boards[0];
  const custom = board === OTHER_BOARD || !boards.includes(board);
  return (
    <div className="space-y-2">
      <InputGroup className="min-w-0" surfaceClassName={surfaceClassName}>
        <GraduationCap aria-hidden="true" data-field-affix="start" className="h-4 w-4" />
        <Select id={id} value={custom ? OTHER_BOARD : board} onChange={(event) => onChange(event.target.value)} aria-describedby={describedBy} disabled={disabled} className="w-full">
          {boards.map((option) => <option key={option} value={option}>{option}</option>)}
        </Select>
      </InputGroup>
      {custom && (
        <Input
          id={`${id}-name`}
          aria-label={nameLabel}
          value={board === OTHER_BOARD ? "" : board}
          onChange={(event) => onChange(event.target.value.trim() ? event.target.value : OTHER_BOARD)}
          placeholder={namePlaceholder}
          maxLength={80}
          disabled={disabled}
          className="sk-enter"
        />
      )}
    </div>
  );
}
