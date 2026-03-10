import { Component, OnInit } from '@angular/core';

@Component({
    selector: 'app-share-redirect',
    standalone: true,
    template: '<div>Redirecting...</div>',
    styles: [`
        div {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            font-family: sans-serif;
        }
    `]
})
export class ShareRedirectComponent implements OnInit {
    ngOnInit(): void {
        // Redirect to external URL
        window.location.href = 'https://bw-im.de/mobimapr';
    }
}
