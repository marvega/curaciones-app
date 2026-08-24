import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateEstablishmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  comuna!: string;
}
