document.addEventListener('DOMContentLoaded', () => {
    // Intersection Observer for scroll animations
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.15
    };

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Observe all elements with the fade-up class
    document.querySelectorAll('.fade-up').forEach(element => {
        observer.observe(element);
    });

    // Smooth scrolling for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                e.preventDefault();
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Add a simple mock interaction for the UI mockup
    const mockLoads = document.querySelectorAll('.mock-load');
    mockLoads.forEach(load => {
        load.addEventListener('click', () => {
            const span = load.querySelector('span');
            if (load.classList.contains('active')) {
                load.classList.remove('active');
                span.textContent = 'OFF';
            } else {
                load.classList.add('active');
                span.textContent = 'ON';
            }
        });
    });
});
