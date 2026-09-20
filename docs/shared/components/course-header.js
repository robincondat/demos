/**
 * En-tête commun aux démonstrateurs TIM.
 *
 * Exemple :
 * <course-header
 *   page-title="Filtrage"
 *   course-code="TIM"
 *   course-name="Traitement d’Images"
 *   instructor="Robin Condat"
 * ></course-header>
 *
 * Seul page-title devrait généralement changer d'un démonstrateur à l'autre.
 * Les autres attributs restent disponibles pour les variantes de cours.
 */
class CourseHeader extends HTMLElement {
  connectedCallback() {
    if (this.dataset.ready === "true") return;

    const pageTitle = this.getAttribute("page-title") || document.title;
    const courseCode = this.getAttribute("course-code") || "TIM";
    const courseName =
      this.getAttribute("course-name") || "Traitement d’Images";
    const instructor = this.getAttribute("instructor") || "";

    this.classList.add("topbar", "course-header");
    this.setAttribute("role", "banner");
    this.innerHTML = `
      <div class="course-identity">
        <strong></strong>
        <span></span>
      </div>
      <h1></h1>
      <div class="instructor"></div>
    `;

    this.querySelector(".course-identity strong").textContent = courseCode;
    this.querySelector(".course-identity span").textContent = courseName;
    this.querySelector("h1").textContent = pageTitle;

    const instructorElement = this.querySelector(".instructor");
    instructorElement.textContent = instructor;
    instructorElement.hidden = !instructor;

    this.dataset.ready = "true";
  }
}

customElements.define("course-header", CourseHeader);
