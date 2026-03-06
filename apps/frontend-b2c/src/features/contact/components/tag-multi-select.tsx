
import { useState, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@ringee/frontend-shared/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from '@ringee/frontend-shared/components/ui/command';
import { Button, buttonVariants } from '@ringee/frontend-shared/components/ui/button';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { cn } from '@ringee/frontend-shared/lib/utils';
import {
  IconX,
  IconTag,
  IconLoader2,
  IconPlus,
  IconCheck
} from '@tabler/icons-react';

export interface Tag {
  id: string;
  name: string;
  color?: string | null;
}

interface TagMultiSelectProps {
  availableTags: Tag[];
  selectedTagIds: string[];
  onSelectionChange: (tagIds: string[]) => void;
  onCreateTag?: (name: string, color?: string) => Promise<Tag>;
  onManageTagsClick?: () => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  showCreateOption?: boolean;
}

export function TagMultiSelect({
  availableTags,
  selectedTagIds,
  onSelectionChange,
  onCreateTag,
  onManageTagsClick,
  placeholder = 'Select tags...',
  className,
  disabled = false,
  showCreateOption = true
}: TagMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const selectedTags = useMemo(
    () => availableTags.filter((tag) => selectedTagIds.includes(tag.id)),
    [availableTags, selectedTagIds]
  );

  const filteredTags = useMemo(() => {
    if (!inputValue) return availableTags;
    const lowerSearch = inputValue.toLowerCase();
    return availableTags.filter((tag) =>
      tag.name.toLowerCase().includes(lowerSearch)
    );
  }, [availableTags, inputValue]);

  const canCreateNew = useMemo(() => {
    if (!showCreateOption || !onCreateTag || !inputValue.trim()) return false;
    const lowerInput = inputValue.toLowerCase().trim();
    return !availableTags.some(
      (tag) => tag.name.toLowerCase() === lowerInput
    );
  }, [availableTags, inputValue, showCreateOption, onCreateTag]);

  const handleSelect = useCallback(
    (tagId: string) => {
      if (selectedTagIds.includes(tagId)) {
        onSelectionChange(selectedTagIds.filter((id) => id !== tagId));
      } else {
        onSelectionChange([...selectedTagIds, tagId]);
      }
    },
    [selectedTagIds, onSelectionChange]
  );

  const handleRemove = useCallback(
    (tagId: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      onSelectionChange(selectedTagIds.filter((id) => id !== tagId));
    },
    [selectedTagIds, onSelectionChange]
  );

  const handleCreate = useCallback(async () => {
    if (!onCreateTag || !inputValue.trim()) return;
    
    setIsCreating(true);
    try {
      // Assign a random color
      const colors = [
        '#ef4444', // red
        '#f97316', // orange
        '#f59e0b', // amber
        '#22c55e', // green
        '#3b82f6', // blue
        '#6366f1', // indigo
        '#a855f7', // purple
        '#ec4899', // pink
      ];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];

      const newTag = await onCreateTag(inputValue.trim(), randomColor); // Pass color if the callback supports it (will check prop type)
      onSelectionChange([...selectedTagIds, newTag.id]);
      setInputValue('');
      toast.success(`Tag "${newTag.name}" created`);
    } catch (err) {
      toast.error('Failed to create tag');
    } finally {
      setIsCreating(false);
    }
  }, [inputValue, onCreateTag, selectedTagIds, onSelectionChange]);

  const getTagColor = (color?: string | null) => {
    if (!color) return 'hsl(var(--primary))';
    return color;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          role="combobox"
          aria-expanded={open}
          className={cn(
            buttonVariants({ variant: "outline" }),
            'min-h-11 w-full justify-between px-3 py-2 cursor-pointer h-auto',
            !selectedTags.length && 'text-muted-foreground',
            disabled && 'pointer-events-none opacity-50',
            className
          )}
          onClick={() => !disabled && setOpen(!open)}
        >
          <div className="flex flex-wrap gap-1">
            {selectedTags.length > 0 ? (
              selectedTags.map((tag) => (
                <Badge
                  key={tag.id}
                  variant="secondary"
                  className="flex items-center gap-1 px-2 py-0.5"
                  style={{ backgroundColor: `${getTagColor(tag.color)}20`, color: getTagColor(tag.color) }}
                >
                  {tag.name}
                  <button
                    type="button"
                    onClick={(e) => handleRemove(tag.id, e)}
                    className="ml-0.5 rounded-full hover:bg-black/10 p-0.5"
                  >
                    <IconX className="h-3 w-3" />
                  </button>
                </Badge>
              ))
            ) : (
              <span className="flex items-center gap-2">
                <IconTag className="h-4 w-4" />
                {placeholder}
              </span>
            )}
          </div>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search or create tags..."
            value={inputValue}
            onValueChange={setInputValue}
          />
          <CommandList>
            <CommandEmpty>
              {canCreateNew ? (
                <div className="text-muted-foreground py-2 text-sm">
                  Press enter or click below to create
                </div>
              ) : (
                'No tags found.'
              )}
            </CommandEmpty>
            
            {canCreateNew && (
              <>
                <CommandGroup heading="Create new">
                  <CommandItem
                    onSelect={handleCreate}
                    disabled={isCreating}
                    className="flex items-center gap-2"
                  >
                    {isCreating ? (
                      <IconLoader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <IconPlus className="h-4 w-4" />
                    )}
                    Create "{inputValue}"
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            
            <CommandGroup heading="Available tags">
              {filteredTags.map((tag) => {
                const isSelected = selectedTagIds.includes(tag.id);
                return (
                  <CommandItem
                    key={tag.id}
                    onSelect={() => handleSelect(tag.id)}
                    className="flex items-center gap-2"
                  >
                    <div
                      className={cn(
                        'flex h-4 w-4 items-center justify-center rounded border',
                        isSelected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-muted'
                      )}
                    >
                      {isSelected && <IconCheck className="h-3 w-3" />}
                    </div>
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: getTagColor(tag.color) }}
                    />
                    <span>{tag.name}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            
            {onManageTagsClick && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => {
                      setOpen(false);
                      onManageTagsClick();
                    }}
                    className="flex items-center gap-2 text-muted-foreground"
                  >
                    <IconTag className="h-4 w-4" />
                    Manage all tags...
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
