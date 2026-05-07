import { SetMetadata } from '@nestjs/common';

export const NO_OAUTH_ACCESS_KEY = 'oauth:noAccess';

export const NoOAuthAccess = () => SetMetadata(NO_OAUTH_ACCESS_KEY, true);
