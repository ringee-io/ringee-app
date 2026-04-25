import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";

@Injectable()
export class EnrichmentFeatureGuard implements CanActivate {
  canActivate(_ctx: ExecutionContext): boolean {
    if (!apiConfiguration.ENRICHMENT_FEATURE_ENABLED) {
      // Hide the entire namespace from the frontend when disabled
      throw new NotFoundException();
    }
    return true;
  }
}
