'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@ringee/frontend-shared/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@ringee/frontend-shared/components/ui/alert-dialog';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import {
  IconPlus,
  IconPencil,
  IconTrash,
  IconLoader2,
  IconCheck,
  IconX,
  IconTag,
  IconColorPicker,
  IconPalette
} from '@tabler/icons-react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { toast } from 'sonner';
import { cn } from '@ringee/frontend-shared/lib/utils';

interface Tag {
  id: string;
  name: string;
  color?: string | null;
}

interface EditTagsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTagsUpdated?: () => void;
}

const DEFAULT_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Green
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#F97316', // Orange
];

interface ColorPickerButtonProps {
  color: string;
  onChange: (color: string) => void;
  className?: string;
}

function ColorPickerButton({ color, onChange, className }: ColorPickerButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="group relative flex h-8 w-8 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 transition-all hover:border-gray-400 hover:scale-110 dark:border-gray-600 dark:hover:border-gray-500"
        style={{
          background: `linear-gradient(135deg, ${color} 0%, ${adjustBrightness(color, -30)} 100%)`,
          borderStyle: 'solid',
          borderColor: 'transparent'
        }}
        title="Choose custom color"
      >
        <div className="absolute inset-0 rounded-lg bg-black/0 transition-all group-hover:bg-black/10" />
        <IconPalette className="h-4 w-4 text-white drop-shadow-md transition-transform group-hover:scale-110" />
      </button>
      <input
        ref={inputRef}
        type="color"
        value={color}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
      />
    </div>
  );
}

function adjustBrightness(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + percent));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + percent));
  const b = Math.min(255, Math.max(0, (num & 0x0000FF) + percent));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function EditTagsModal({
  open,
  onOpenChange,
  onTagsUpdated
}: EditTagsModalProps) {
  const api = useApi();
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(DEFAULT_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tagToDelete, setTagToDelete] = useState<Tag | null>(null);

  const fetchTags = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Tag[]>('/tags');
      setTags(data);
    } catch (err) {
      toast.error('Failed to load tags');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (open) {
      fetchTags();
    }
  }, [open, fetchTags]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    
    setSaving(true);
    try {
      const tag = await api.post<Tag>('/tags', {
        name: newName.trim(),
        color: newColor
      });
      setTags([...tags, tag]);
      setNewName('');
      setNewColor(DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)]);
      setIsCreating(false);
      toast.success('Tag created');
      onTagsUpdated?.();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create tag');
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (tag: Tag) => {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color || DEFAULT_COLORS[0]);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditColor('');
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    
    setSaving(true);
    try {
      const updated = await api.put<Tag>(`/tags/${editingId}`, {
        name: editName.trim(),
        color: editColor
      });
      setTags(tags.map((t) => (t.id === editingId ? updated : t)));
      handleCancelEdit();
      toast.success('Tag updated');
      onTagsUpdated?.();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update tag');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (tag: Tag) => {
    setTagToDelete(tag);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!tagToDelete) return;
    
    try {
      await api.delete(`/tags/${tagToDelete.id}`);
      setTags(tags.filter((t) => t.id !== tagToDelete.id));
      toast.success('Tag deleted');
      onTagsUpdated?.();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete tag');
    } finally {
      setDeleteDialogOpen(false);
      setTagToDelete(null);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconTag className="h-5 w-5" />
            Manage Tags
          </DialogTitle>
          <DialogDescription>
            Create and manage tags to organize your contacts
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Create new tag section */}
          {isCreating ? (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="space-y-2">
                <Label>Tag name</Label>
                <Input
                  placeholder="Enter tag name..."
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <IconColorPicker className="h-4 w-4" />
                  Color
                </Label>
                <div className="flex flex-wrap items-center gap-2">
                  {DEFAULT_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setNewColor(color)}
                      className={cn(
                        'h-8 w-8 rounded-lg border-2 transition-all hover:scale-110',
                        newColor === color
                          ? 'border-foreground ring-2 ring-offset-2 ring-foreground/20'
                          : 'border-transparent hover:border-gray-300'
                      )}
                      style={{ 
                        background: `linear-gradient(135deg, ${color} 0%, ${adjustBrightness(color, -30)} 100%)`
                      }}
                    />
                  ))}
                  <ColorPickerButton
                    color={newColor}
                    onChange={setNewColor}
                  />
                </div>
                {/* Color preview */}
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-sm text-muted-foreground">Preview:</span>
                  <Badge
                    variant="secondary"
                    style={{
                      backgroundColor: `${newColor}20`,
                      color: newColor,
                      borderColor: newColor
                    }}
                    className="border"
                  >
                    {newName || 'Tag name'}
                  </Badge>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleCreate}
                  disabled={saving || !newName.trim()}
                >
                  {saving ? (
                    <IconLoader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <IconCheck className="h-4 w-4" />
                  )}
                  Create
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsCreating(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setIsCreating(true)}
            >
              <IconPlus className="mr-2 h-4 w-4" />
              Create New Tag
            </Button>
          )}

          {/* Tags list */}
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <IconLoader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : tags.length === 0 ? (
              <div className="text-muted-foreground py-8 text-center text-sm">
                No tags created yet
              </div>
            ) : (
              tags.map((tag) =>
                editingId === tag.id ? (
                  <div
                    key={tag.id}
                    className="flex items-center gap-2 rounded-lg border p-2"
                  >
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="h-8 flex-1"
                      autoFocus
                    />
                    <div className="flex items-center gap-1">
                      {DEFAULT_COLORS.slice(0, 4).map((color) => (
                        <button
                          key={color}
                          onClick={() => setEditColor(color)}
                          className={cn(
                            'h-6 w-6 rounded-md border transition-all hover:scale-110',
                            editColor === color
                              ? 'border-foreground ring-1 ring-foreground/20'
                              : 'border-transparent'
                          )}
                          style={{ 
                            background: `linear-gradient(135deg, ${color} 0%, ${adjustBrightness(color, -30)} 100%)`
                          }}
                        />
                      ))}
                      <ColorPickerButton
                        color={editColor}
                        onChange={setEditColor}
                        className="ml-1"
                      />
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={handleSaveEdit}
                      disabled={saving}
                    >
                      <IconCheck className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={handleCancelEdit}
                    >
                      <IconX className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div
                    key={tag.id}
                    className="flex items-center justify-between rounded-lg border p-2 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="h-4 w-4 rounded-full shadow-sm"
                        style={{
                          background: `linear-gradient(135deg, ${tag.color || DEFAULT_COLORS[0]} 0%, ${adjustBrightness(tag.color || DEFAULT_COLORS[0], -30)} 100%)`
                        }}
                      />
                      <Badge
                        variant="secondary"
                        className="border"
                        style={{
                          backgroundColor: `${tag.color || DEFAULT_COLORS[0]}20`,
                          color: tag.color || DEFAULT_COLORS[0],
                          borderColor: `${tag.color || DEFAULT_COLORS[0]}40`
                        }}
                      >
                        {tag.name}
                      </Badge>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => handleStartEdit(tag)}
                      >
                        <IconPencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive hover:text-destructive h-7 w-7"
                        onClick={() => handleDeleteClick(tag)}
                      >
                        <IconTrash className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              )
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="sm:max-w-[400px]">
          <AlertDialogHeader className="flex flex-col items-center gap-4 pt-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <IconTrash className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
            <AlertDialogTitle className="text-center text-xl">Delete tag?</AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              This will permanently delete <span className="font-semibold text-foreground">"{tagToDelete?.name}"</span> and remove it from all contacts. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0 pt-4">
            <AlertDialogAction
              onClick={confirmDelete}
              className="w-full bg-gradient-to-r from-red-600 to-red-500 text-white hover:from-red-700 hover:to-red-600 shadow-lg shadow-red-500/20"
            >
              Yes, delete tag
            </AlertDialogAction>
            <AlertDialogCancel className="w-full">Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

