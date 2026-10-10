import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";

/** Column sizes of `ContactList`, and how many contacts one request may add. */
export const CONTACT_LIST_LIMITS = {
  NAME_MAX: 120,
  DESCRIPTION_MAX: 1000,
  ADD_CONTACTS_MAX: 500,
} as const;

/**
 * A new list. Sent as JSON, or as multipart form fields next to an optional
 * `file` (a contacts CSV) to create and fill the list in one step.
 */
export class CreateContactListDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(CONTACT_LIST_LIMITS.NAME_MAX)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(CONTACT_LIST_LIMITS.DESCRIPTION_MAX)
  description?: string;

  /** Who works the list. Defaults to the creator; only an org admin may name someone else. */
  @IsOptional()
  @IsUUID()
  assignedToId?: string;
}

export class UpdateContactListDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(CONTACT_LIST_LIMITS.NAME_MAX)
  name?: string;

  /** An empty string or `null` clears it. */
  @IsOptional()
  @IsString()
  @MaxLength(CONTACT_LIST_LIMITS.DESCRIPTION_MAX)
  description?: string | null;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;
}

/** Contacts already in the workspace, put into a list. */
export class AddContactListContactsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CONTACT_LIST_LIMITS.ADD_CONTACTS_MAX)
  @IsUUID("all", { each: true })
  contactIds!: string[];
}

/**
 * A person typed into a list by hand. The number is matched against the
 * workspace first, so a contact it already has is added rather than copied.
 */
export class AddContactListContactDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phoneNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(100)
  email?: string;

  /** The company, named as on `CreateContactDto`. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  organization?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  jobTitle?: string;
}
