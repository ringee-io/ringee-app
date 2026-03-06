'use client';

import { useState, useCallback, useEffect } from 'react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@ringee/frontend-shared/components/ui/popover';
import { IconFilter, IconX } from '@tabler/icons-react';
import { useQueryState, parseAsArrayOf, parseAsString } from 'nuqs';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Checkbox } from '@ringee/frontend-shared/components/ui/checkbox';
import { cn } from '@ringee/frontend-shared/lib/utils';

interface Tag {
  id: string;
  name: string;
  color?: string | null;
}

export function ContactsTagFilter() {
  const api = useApi();
  const [tags, setTags] = useState<Tag[]>([]);
  const [open, setOpen] = useState(false);
  // shallow: false triggers full page navigation which re-runs the Server Component
  const [selectedTags, setSelectedTags] = useQueryState(
    'tags',
    parseAsArrayOf(parseAsString).withDefault([]).withOptions({ shallow: false })
  );

  const fetchTags = useCallback(async () => {
    try {
      const data = await api.get<Tag[]>('/tags');
      setTags(data);
    } catch (err) {
      console.error('Failed to fetch tags');
    }
  }, [api]);

  // Load tags on mount if there are selected tags (to show proper label)
  // Also load when popover opens
  useEffect(() => {
    if (selectedTags.length > 0 || open) {
      fetchTags();
    }
  }, [open, selectedTags.length, fetchTags]);

  const handleTagToggle = (tagId: string) => {
    const newTags = selectedTags.includes(tagId)
      ? selectedTags.filter(id => id !== tagId)
      : [...selectedTags, tagId];
    // Just update the query state - shallow:false will trigger navigation
    setSelectedTags(newTags.length > 0 ? newTags : null);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedTags(null);
  };

  const getTagColor = (color?: string | null) => color || '#3B82F6';

  const hasValue = selectedTags.length > 0;

  const formatLabel = () => {
    if (!hasValue) return 'Filter by tags';
    // If tags loaded, show name(s); otherwise show count
    const selected = tags.filter(t => selectedTags.includes(t.id));
    if (selected.length === 1) return selected[0].name;
    if (selected.length > 0) return `${selected.length} tags`;
    // Tags not loaded yet, show count from URL
    return `${selectedTags.length} tags`;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('border-dashed min-w-0', hasValue && 'border-primary')}
        >
          {hasValue ? (
            <div
              role="button"
              aria-label="Clear tag filter"
              tabIndex={0}
              onClick={handleClear}
              className="focus-visible:ring-ring rounded-sm opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-1 focus-visible:outline-none"
            >
              <IconX className="h-4 w-4" />
            </div>
          ) : (
            <IconFilter className="h-4 w-4" />
          )}
          <span className="ml-2 truncate sm:max-w-none">{formatLabel()}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-3" align="start">
        <div className="space-y-2 max-h-[200px] overflow-y-auto">
          {tags.map((tag) => (
            <label
              key={tag.id}
              className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1 rounded"
            >
              <Checkbox
                checked={selectedTags.includes(tag.id)}
                onCheckedChange={() => handleTagToggle(tag.id)}
              />
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: getTagColor(tag.color) }}
              />
              <span className="text-sm">{tag.name}</span>
            </label>
          ))}
          {tags.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">No tags</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}



