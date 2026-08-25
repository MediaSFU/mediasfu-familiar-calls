import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { mountFamiliarCall } from '../../../whip-whep/src/main.js';

@Component({
  selector: 'app-whip-whep-host',
  standalone: true,
  template: '<div #host data-framework-host="angular"></div>',
})
export class WhipWhepHostComponent implements AfterViewInit, OnDestroy {
  @ViewChild('host', { static: true }) private host!: ElementRef<HTMLElement>;
  private unmount?: () => void;

  ngAfterViewInit(): void {
    this.unmount = mountFamiliarCall(this.host.nativeElement);
  }

  ngOnDestroy(): void {
    this.unmount?.();
  }
}
