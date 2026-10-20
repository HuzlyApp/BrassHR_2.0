"use client";

import { useEffect, useMemo, useState } from "react";
import type { SignupCityOption, SignupStateOption } from "@/lib/signup/owner-signup";
import { getStateCodeFromName, getStateNameFromCode } from "@/lib/us-state-names";

/**
 * Loads US states/cities from the public signup options API
 * (signup_us_states / signup_us_cities). Safe for unauthenticated pages.
 */
export function useUsLocationOptions(selectedStateLabel: string, enabled = true) {
  const [stateRows, setStateRows] = useState<SignupStateOption[]>([]);
  const [stateOptions, setStateOptions] = useState<string[]>([]);
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const [locationLoading, setLocationLoading] = useState(enabled);
  const [citiesLoading, setCitiesLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setLocationLoading(false);
      return;
    }

    let active = true;
    setLocationLoading(true);
    void (async () => {
      try {
        const response = await fetch("/api/auth/signup/options", { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as {
          states?: SignupStateOption[];
          error?: string;
        };
        if (!response.ok || !active) return;
        const states = Array.isArray(payload.states) ? payload.states : [];
        setStateRows(states);
        setStateOptions(states.map((row) => row.name));
      } finally {
        if (active) setLocationLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [enabled]);

  const selectedStateCode = useMemo(() => {
    const trimmed = selectedStateLabel.trim();
    if (!trimmed) return "";
    const fromRowsByName = stateRows.find(
      (row) => row.name.toLowerCase() === trimmed.toLowerCase()
    )?.code;
    if (fromRowsByName) return fromRowsByName.toUpperCase();
    const fromRowsByCode = stateRows.find(
      (row) => row.code.toUpperCase() === trimmed.toUpperCase()
    )?.code;
    if (fromRowsByCode) return fromRowsByCode.toUpperCase();
    const fromName = getStateCodeFromName(trimmed);
    if (fromName) return fromName;
    const upper = trimmed.toUpperCase();
    if (upper.length === 2 && getStateNameFromCode(upper)) return upper;
    return "";
  }, [selectedStateLabel, stateRows]);

  useEffect(() => {
    if (!enabled || !selectedStateCode || selectedStateCode.length !== 2) {
      setCityOptions([]);
      setCitiesLoading(false);
      return;
    }

    let active = true;
    setCitiesLoading(true);
    void (async () => {
      try {
        const response = await fetch(
          `/api/auth/signup/options?stateCode=${encodeURIComponent(selectedStateCode)}`,
          { cache: "no-store" }
        );
        const payload = (await response.json().catch(() => ({}))) as {
          cities?: SignupCityOption[];
        };
        if (!response.ok || !active) return;
        const cities = Array.isArray(payload.cities) ? payload.cities : [];
        setCityOptions(cities.map((row) => row.name));
      } finally {
        if (active) setCitiesLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [enabled, selectedStateCode]);

  const displayStateValue = useMemo(() => {
    const raw = selectedStateLabel.trim();
    if (!raw) return "";
    if (stateOptions.includes(raw)) return raw;
    const fromCode = getStateNameFromCode(raw);
    if (fromCode && stateOptions.includes(fromCode)) return fromCode;
    const fromRows = stateRows.find(
      (row) => row.code.toUpperCase() === raw.toUpperCase()
    )?.name;
    return fromRows || raw;
  }, [selectedStateLabel, stateOptions, stateRows]);

  const effectiveStateOptions = useMemo(() => {
    const current = displayStateValue.trim();
    if (!current || stateOptions.includes(current)) return stateOptions;
    return [...stateOptions, current].sort((a, b) => a.localeCompare(b));
  }, [displayStateValue, stateOptions]);

  return {
    stateRows,
    stateOptions: effectiveStateOptions,
    cityOptions,
    locationLoading,
    citiesLoading,
    selectedStateCode,
    displayStateValue,
  };
}
