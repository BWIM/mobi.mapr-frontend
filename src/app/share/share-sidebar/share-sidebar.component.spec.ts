import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ShareSidebarComponent } from './share-sidebar.component';

describe('ShareSidebarComponent', () => {
  let component: ShareSidebarComponent;
  let fixture: ComponentFixture<ShareSidebarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShareSidebarComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ShareSidebarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
