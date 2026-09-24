"use client";

import { FieldPath, FieldValues } from "react-hook-form";
import { HelpCircle } from "lucide-react";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { Input } from "../ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { BaseFormFieldProps } from "../../types/base-form";

interface FormInputProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> extends BaseFormFieldProps<TFieldValues, TName> {
  type?: "text" | "email" | "password" | "number" | "tel" | "url";
  placeholder?: string;
  step?: string | number;
  min?: string | number;
  max?: string | number;
  /** Short explanation revealed from a help icon beside the label. */
  tooltip?: string;
}

function FormInputLabel({
  label,
  required,
}: {
  label: string;
  required?: boolean;
}) {
  return (
    <FormLabel>
      {label}
      {required && <span className="ml-1 text-red-500">*</span>}
    </FormLabel>
  );
}

function FormInput<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  control,
  name,
  label,
  description,
  required,
  type = "text",
  placeholder,
  step,
  min,
  max,
  disabled,
  className,
  tooltip,
}: FormInputProps<TFieldValues, TName>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          {label && tooltip ? (
            <div className="flex items-center gap-1.5">
              <FormInputLabel label={label} required={required} />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex size-5 cursor-help items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
                    aria-label={`${label}: ${tooltip}`}
                  >
                    <HelpCircle className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-72">
                  {tooltip}
                </TooltipContent>
              </Tooltip>
            </div>
          ) : (
            label && <FormInputLabel label={label} required={required} />
          )}
          <FormControl>
            <Input
              type={type}
              placeholder={placeholder}
              step={step}
              min={min}
              max={max}
              disabled={disabled}
              {...field}
              onChange={(e) => {
                if (type === "number") {
                  const value = e.target.value;
                  field.onChange(value === "" ? undefined : parseFloat(value));
                } else {
                  field.onChange(e.target.value);
                }
              }}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export { FormInput };
