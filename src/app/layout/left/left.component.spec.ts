import { ComponentFixture, TestBed } from '@angular/core/testing';
import { testProviders } from '../../testing/test-providers';

import { LeftComponent } from './left.component';

describe('LeftComponent', () => {
  let component: LeftComponent;
  let fixture: ComponentFixture<LeftComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LeftComponent],
      providers: testProviders(),
    })
    .compileComponents();

    fixture = TestBed.createComponent(LeftComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
