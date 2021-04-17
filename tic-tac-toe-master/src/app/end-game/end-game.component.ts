import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { IIsWinner } from 'src/app/end-game/end-game.model';

@Component({
  selector: 'app-end-game',
  templateUrl: './end-game.component.html',
  styleUrls: ['./end-game.component.scss'],
})
export class EndGameComponent {
  constructor(
    @Inject(MAT_DIALOG_DATA) readonly data: IIsWinner,
    readonly dialogRef: MatDialogRef<EndGameComponent>,
  ) {
  }
}
