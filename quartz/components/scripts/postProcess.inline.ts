


document.addEventListener("nav", () => {
    console.log("Hello, World!")
    const element = document.getElementById('explorer-ul');
    if (!element) return;
    const measurementFromTopToStartingPoint = element.getBoundingClientRect().top;
    let height = `calc(100vh - ${measurementFromTopToStartingPoint}px)`;
    element.style.height = height;
    element.style.maxHeight = height;
})