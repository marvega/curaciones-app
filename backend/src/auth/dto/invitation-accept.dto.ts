import { IsString, IsNotEmpty, MinLength } from 'class-validator';
export class InvitationAcceptDto {
  @IsString() @IsNotEmpty() token: string;
  @IsString() @MinLength(12) password: string;
  @IsString() @IsNotEmpty() fullName: string;
}
