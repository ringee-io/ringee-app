'use client';

import { useState, useEffect } from 'react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Trash2, Loader2, Check, ChevronsUpDown, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ringee/frontend-shared/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@ringee/frontend-shared/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ringee/frontend-shared/components/ui/popover"
import { ScrollArea } from '@ringee/frontend-shared/components/ui/scroll-area';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Tag } from './tag-multi-select';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Avatar, AvatarFallback } from '@ringee/frontend-shared/components/ui/avatar';

interface ContactPreview {
  id: string;
  name: string;
  email?: string;
  phoneNumber: string;
  company?: string; // Mapped from organization
}

export function ContactsBulkDelete() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchingPreview, setFetchingPreview] = useState(false);
  
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTag, setSelectedTag] = useState<Tag | null>(null);
  const [previewContacts, setPreviewContacts] = useState<ContactPreview[]>([]);
  const [totalContacts, setTotalContacts] = useState(0);
  
  const [tagOpen, setTagOpen] = useState(false);

  const api = useApi();
  const router = useRouter();

  useEffect(() => {
    if (open) {
      // Fetch tags when modal opens
      api.get<Tag[]>('/tags').then(setTags).catch(() => setTags([]));
    }
  }, [open, api]);

  useEffect(() => {
    if (selectedTag) {
      setFetchingPreview(true);
      // Fetch preview contacts
      api.get<{ data: ContactPreview[], meta: { total: number } }>(`/contacts?tags=${selectedTag.id}&limit=50`)
        .then(res => {
          setPreviewContacts(res.data);
          setTotalContacts(res.meta.total);
        })
        .catch(() => {
          setPreviewContacts([]);
          setTotalContacts(0);
        })
        .finally(() => setFetchingPreview(false));
    } else {
      setPreviewContacts([]);
      setTotalContacts(0);
    }
  }, [selectedTag, api]);

  const handleDelete = async () => {
    if (!selectedTag) return;
    
    setLoading(true);
    try {
      await api.delete('/contacts/by-tags', { tagIds: [selectedTag.id] });
      toast.success(`Successfully deleted ${totalContacts} contacts`);
      setOpen(false);
      setSelectedTag(null);
      router.refresh();
    } catch (error) {
      toast.error('Failed to delete contacts');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="ml-0 sm:ml-2">
          <Trash2 className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Delete by Tag</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[95vw] max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Delete Contacts by Tag</DialogTitle>
          <DialogDescription>
            Select a tag to delete all associated contacts. This will remove the contacts permanently but keep the tag.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Select Tag</label>
            <Popover open={tagOpen} onOpenChange={setTagOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={tagOpen}
                  className="w-full justify-between"
                >
                  {selectedTag ? (
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant="secondary"
                        style={{
                          backgroundColor: `${selectedTag.color || '#3B82F6'}20`,
                          color: selectedTag.color || '#3B82F6',
                        }}
                      >
                        {selectedTag.name}
                      </Badge>
                    </div>
                  ) : (
                    "Select tag..."
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[calc(100vw-2rem)] max-w-[400px] p-0">
                <Command>
                  <CommandInput placeholder="Search tag..." />
                  <CommandList>
                    <CommandEmpty>No tag found.</CommandEmpty>
                    <CommandGroup>
                      {tags.map((tag) => (
                        <CommandItem
                          key={tag.id}
                          value={tag.name}
                          onSelect={() => {
                            setSelectedTag(tag);
                            setTagOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedTag?.id === tag.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <Badge 
                            variant="secondary"
                            style={{
                              backgroundColor: `${tag.color || '#3B82F6'}20`,
                              color: tag.color || '#3B82F6',
                            }}
                          >
                            {tag.name}
                          </Badge>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {selectedTag && (
            <div className="space-y-2 border rounded-md p-4 bg-slate-50 dark:bg-slate-900/50">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  Contacts Preview 
                  <span className="text-muted-foreground font-normal">
                    ({fetchingPreview ? 'Loading...' : `${totalContacts} found`})
                  </span>
                </h4>
              </div>

              {fetchingPreview ? (
                <div className="h-[200px] flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : previewContacts.length > 0 ? (
                <ScrollArea className="h-[300px] pr-4">
                  <div className="space-y-3">
                    {previewContacts.map(contact => (
                      <div key={contact.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback>{contact.name.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="grid gap-0.5 text-xs">
                          <div className="font-medium text-sm">{contact.name}</div>
                          <div className="text-muted-foreground">{contact.email}</div>
                          <div className="text-muted-foreground flex gap-2">
                            <span>{contact.phoneNumber}</span>
                            {contact.company && (
                              <>
                                <span>•</span>
                                <span>{contact.company}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {totalContacts > 50 && (
                      <p className="text-xs text-center text-muted-foreground py-2">
                        And {totalContacts - 50} more...
                      </p>
                    )}
                  </div>
                </ScrollArea>
              ) : (
                <div className="h-[100px] flex items-center justify-center text-sm text-muted-foreground">
                  No contacts found with this tag.
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => setOpen(false)} className="w-full sm:w-auto">Cancel</Button>
          <Button 
            variant="destructive" 
            onClick={handleDelete} 
            disabled={!selectedTag || loading || totalContacts === 0}
            className="w-full sm:w-auto"
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            Delete {totalContacts} Contacts
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
