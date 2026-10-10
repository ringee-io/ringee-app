import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  AddContactListContactDto,
  AddContactListContactsDto,
  CSV_IMPORT_CONFIG,
  CreateContactListDto,
  CurrentUser,
  CurrentUserData,
  UpdateContactListDto,
  createOwnershipContext,
} from "@ringee/platform";
import { ContactListActor, ContactListService } from "@ringee/services";
import { TriggerLoopEventPublisher } from "../../triggerloop/services/triggerloop-event-publisher.service";

interface UploadedCsv {
  buffer: Buffer;
  originalname: string;
}

/** A list takes the same CSV as the Contacts import: same limits, same format. */
const csvUpload = () =>
  FileInterceptor("file", {
    limits: { fileSize: CSV_IMPORT_CONFIG.MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
      if (!file.originalname.toLowerCase().endsWith(".csv")) {
        cb(new BadRequestException("Only CSV files are allowed"), false);
      } else {
        cb(null, true);
      }
    },
  });

/**
 * Contact lists (LIST-001..LIST-004) of the signed-in user's active workspace.
 * Who may see or change which list is decided in `ContactListService`; this
 * controller only says who is asking.
 */
@Controller("contact-lists")
export class ContactListController {
  constructor(
    private readonly lists: ContactListService,
    private readonly triggerLoop: TriggerLoopEventPublisher,
  ) {}

  @Get()
  list(
    @CurrentUser() user: CurrentUserData,
    @Query("search") search?: string,
    @Query("assignedToId") assignedToId?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.lists.list(actorOf(user), {
      search,
      assignedToId,
      page: Number(page),
      limit: Number(limit),
    });
  }

  /** JSON, or multipart with an optional `file` to fill the list at once. */
  @Post()
  @UseInterceptors(csvUpload())
  async create(
    @CurrentUser() user: CurrentUserData,
    @Body() body: CreateContactListDto,
    @UploadedFile() file?: UploadedCsv,
  ) {
    const result = await this.lists.create(
      actorOf(user),
      body,
      file ? file.buffer.toString("utf-8") : undefined,
    );
    await this.announceImport(user, result.import?.contactsCreated ?? 0);
    return result;
  }

  @Get(":id")
  get(
    @CurrentUser() user: CurrentUserData,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.lists.get(actorOf(user), id);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: CurrentUserData,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateContactListDto,
  ) {
    return this.lists.update(actorOf(user), id, body);
  }

  @Delete(":id")
  async remove(
    @CurrentUser() user: CurrentUserData,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    await this.lists.remove(actorOf(user), id);
    return { success: true };
  }

  /** Draft cleanup has its own route: an older server must fail closed. */
  @Delete(":id/empty")
  async removeEmpty(
    @CurrentUser() user: CurrentUserData,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    await this.lists.remove(actorOf(user), id, { onlyIfEmpty: true });
    return { success: true };
  }

  @Get(":id/contacts")
  listContacts(
    @CurrentUser() user: CurrentUserData,
    @Param("id", ParseUUIDPipe) id: string,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.lists.listContacts(actorOf(user), id, {
      search,
      page: Number(page),
      limit: Number(limit),
    });
  }

  @Post(":id/import")
  @UseInterceptors(csvUpload())
  async importCsv(
    @CurrentUser() user: CurrentUserData,
    @Param("id", ParseUUIDPipe) id: string,
    @UploadedFile() file?: UploadedCsv,
  ) {
    if (!file) throw new BadRequestException("No file uploaded");
    const summary = await this.lists.importCsv(
      actorOf(user),
      id,
      file.buffer.toString("utf-8"),
    );
    await this.announceImport(user, summary.contactsCreated);
    return summary;
  }

  /** Contacts the workspace already has. */
  @Post(":id/contacts")
  addContacts(
    @CurrentUser() user: CurrentUserData,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: AddContactListContactsDto,
  ) {
    return this.lists.addContacts(actorOf(user), id, body.contactIds);
  }

  /** A person typed in by hand, matched by number before anything is created. */
  @Post(":id/contacts/new")
  addNewContact(
    @CurrentUser() user: CurrentUserData,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: AddContactListContactDto,
  ) {
    return this.lists.addNewContact(actorOf(user), id, body);
  }

  @Delete(":id/contacts/:contactId")
  removeContact(
    @CurrentUser() user: CurrentUserData,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("contactId", ParseUUIDPipe) contactId: string,
  ) {
    return this.lists.removeContact(actorOf(user), id, contactId);
  }

  /** Same follow-up as the Contacts import, only once a file created contacts. */
  private async announceImport(user: CurrentUserData, contactsCreated: number) {
    if (contactsCreated > 0) {
      await this.triggerLoop.contactsImported(user.id, contactsCreated);
    }
  }
}

function actorOf(user: CurrentUserData): ContactListActor {
  return {
    ...createOwnershipContext(user),
    isOrgAdmin: user.activeOrgRole === "org:admin",
  };
}
