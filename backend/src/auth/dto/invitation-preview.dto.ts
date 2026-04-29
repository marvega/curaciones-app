import { IsString, IsNotEmpty } from 'class-validator';
export class InvitationPreviewDto {
  @IsString() @IsNotEmpty() token: string;
}
