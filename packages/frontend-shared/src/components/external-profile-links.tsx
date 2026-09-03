"use client";

import { Building2, Globe2, Linkedin } from "lucide-react";

import { Button } from "./ui/button";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";

export interface ExternalProfileUrls {
  linkedinUrl?: string | null;
  companyLinkedinUrl?: string | null;
  websiteUrl?: string | null;
}

export interface ExternalProfileLabels {
  group: string;
  linkedinProfile: string;
  linkedinCompany: string;
  website: string;
}

type ExternalProfileLink = {
  key: keyof ExternalProfileUrls;
  label: string;
  url: string;
  icon: typeof Linkedin;
};

function normalizeExternalUrl(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function externalProfileLinks(
  urls: ExternalProfileUrls,
  labels: ExternalProfileLabels,
): ExternalProfileLink[] {
  const candidates: Array<
    Omit<ExternalProfileLink, "url"> & { url?: string | null }
  > = [
    {
      key: "linkedinUrl",
      label: labels.linkedinProfile,
      url: urls.linkedinUrl,
      icon: Linkedin,
    },
    {
      key: "companyLinkedinUrl",
      label: labels.linkedinCompany,
      url: urls.companyLinkedinUrl,
      icon: Building2,
    },
    {
      key: "websiteUrl",
      label: labels.website,
      url: urls.websiteUrl,
      icon: Globe2,
    },
  ];

  return candidates.flatMap((candidate) => {
    const url = normalizeExternalUrl(candidate.url);
    return url ? [{ ...candidate, url }] : [];
  });
}

/** Opens an external profile beside Ringee in a half-screen browser window. */
export function openExternalProfileWindow(url: string): void {
  const normalized = normalizeExternalUrl(url);
  if (!normalized || typeof window === "undefined") return;

  const currentScreen = window.screen as Screen & {
    availLeft?: number;
    availTop?: number;
  };
  const width = Math.round(currentScreen.availWidth / 2);
  const height = currentScreen.availHeight;
  const left =
    (currentScreen.availLeft ?? window.screenX) +
    currentScreen.availWidth -
    width;
  const top = currentScreen.availTop ?? window.screenY;

  window.open(
    normalized,
    "_blank",
    [
      "popup=yes",
      "noopener",
      "noreferrer",
      `width=${width}`,
      `height=${height}`,
      `left=${left}`,
      `top=${top}`,
    ].join(","),
  );
}

export function hasExternalProfileLinks(urls: ExternalProfileUrls): boolean {
  return [urls.linkedinUrl, urls.companyLinkedinUrl, urls.websiteUrl].some(
    (url) => normalizeExternalUrl(url) !== null,
  );
}

export function ExternalProfileMenuItems({
  urls,
  labels,
  separator = true,
}: {
  urls: ExternalProfileUrls;
  labels: ExternalProfileLabels;
  separator?: boolean;
}) {
  const links = externalProfileLinks(urls, labels);
  if (links.length === 0) return null;

  return (
    <>
      {separator ? <DropdownMenuSeparator /> : null}
      <DropdownMenuLabel className="text-muted-foreground text-xs">
        {labels.group}
      </DropdownMenuLabel>
      {links.map(({ key, label, url, icon: Icon }) => (
        <DropdownMenuItem
          key={key}
          onSelect={() => openExternalProfileWindow(url)}
        >
          <Icon aria-hidden="true" />
          {label}
        </DropdownMenuItem>
      ))}
    </>
  );
}

export function ExternalProfileButtons({
  urls,
  labels,
}: {
  urls: ExternalProfileUrls;
  labels: ExternalProfileLabels;
}) {
  const links = externalProfileLinks(urls, labels);
  if (links.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2" aria-label={labels.group}>
      {links.map(({ key, label, url, icon: Icon }) => (
        <Button
          key={key}
          type="button"
          variant="outline"
          size="sm"
          className="cursor-pointer"
          onClick={() => openExternalProfileWindow(url)}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          {label}
        </Button>
      ))}
    </div>
  );
}
