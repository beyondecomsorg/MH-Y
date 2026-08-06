document.addEventListener("DOMContentLoaded", function () {
  // Ensure the first tab is active by default
  const activeItems = document.querySelectorAll(".accordion > .accordion-item.is-active");
  activeItems.forEach((item) => {
    const panel = item.querySelector(".accordion-panel");
    if (panel) panel.style.display = "block";
  });

  // Add click event listener to all accordion items
  const accordionItems = document.querySelectorAll(".accordion > .accordion-item");
  accordionItems.forEach((item) => {
    item.addEventListener("click", function () {
      // Close all other panels
      accordionItems.forEach((sibling) => {
        if (sibling !== this) {
          sibling.classList.remove("is-active");
          const siblingPanel = sibling.querySelector(".accordion-panel");
          if (siblingPanel) siblingPanel.style.display = "none";
        }
      });

      // Toggle the clicked panel
      const panel = this.querySelector(".accordion-panel");
      if (panel) {
        const isActive = this.classList.toggle("is-active");
        panel.style.display = isActive ? "block" : "none";
      }
    });
  });
});

(function () {
  function loadLazyVideo(video) {
    if (!video || video.dataset.lazyVideoLoaded === "true") return;

    const sources = video.querySelectorAll("source[data-src]");
    sources.forEach((source) => {
      source.src = source.dataset.src;
      source.removeAttribute("data-src");
    });

    if (video.dataset.src) {
      video.src = video.dataset.src;
      video.removeAttribute("data-src");
    }

    video.load();

    if (video.autoplay) {
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(function () {});
      }
    }

    video.dataset.lazyVideoLoaded = "true";
  }

  function initLazyVideos(root) {
    const scope = root && root.querySelectorAll ? root : document;
    const videos = scope.querySelectorAll("video[data-lazy-video]:not([data-lazy-video-initialized])");
    if (!videos.length) return;

    if (!("IntersectionObserver" in window)) {
      videos.forEach((video) => {
        video.dataset.lazyVideoInitialized = "true";
        loadLazyVideo(video);
      });
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          loadLazyVideo(entry.target);
          observer.unobserve(entry.target);
        });
      },
      { root: null, rootMargin: "250px 0px", threshold: 0.01 }
    );

    videos.forEach((video) => {
      video.dataset.lazyVideoInitialized = "true";
      observer.observe(video);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initLazyVideos(document);
  });

  document.addEventListener("shopify:section:load", function (event) {
    initLazyVideos(event.target);
  });
})();

(function () {
  const ENABLE_CUSTOM_QUICK_ACTIONS = window.MHY_ENABLE_CUSTOM_QUICK_ACTIONS === true;
  const STATE = {
    intent: "quickview"
  };

  const cssEscape = (function () {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape;
    return function (value) {
      return String(value).replace(/["\\]/g, "\\$&");
    };
  })();

  function getIntentFromClickTarget(target) {
    const el = target && target.closest ? target.closest("[data-qv-action]") : null;
    if (!el) return null;
    return el.getAttribute("data-qv-action");
  }

  function setValidationState(context, isValid) {
    const validation = context.querySelector("[data-mhy-qv-validation]");
    const variantsWrap = context.querySelector("[data-mhy-qv-variants]");
    if (!validation || !variantsWrap) return;

    if (isValid) {
      validation.hidden = true;
      variantsWrap.classList.remove("mhy-qv--invalid");
      return;
    }

    validation.hidden = false;
    validation.textContent = "Please select a size.";
    variantsWrap.classList.remove("mhy-qv--invalid");
    variantsWrap.offsetWidth;
    variantsWrap.classList.add("mhy-qv--invalid");
  }

  function markSizeSelected(context) {
    context.dataset.mhySizeSelected = "true";
    setValidationState(context, true);
    const variantsWrap = context.querySelector("[data-mhy-qv-variants]");
    if (variantsWrap) variantsWrap.classList.remove("mhy-qv--needs-selection");
  }

  function requiresExplicitSizeSelection(context) {
    return context.dataset.requiresSizeSelection === "true";
  }

  function isSizeSelected(context) {
    return context.dataset.mhySizeSelected === "true";
  }

  function shouldBlockForMissingSize(context) {
    if (!requiresExplicitSizeSelection(context)) return false;
    return !isSizeSelected(context);
  }

  function initDelivery(context) {
    const wrap = context.querySelector("[data-mhy-qv-delivery]");
    if (!wrap) return;

    const input = wrap.querySelector(".mhy-qv__delivery-input");
    const btn = wrap.querySelector("[data-mhy-qv-delivery-check]");
    const msg = wrap.querySelector("[data-mhy-qv-delivery-msg]");
    if (!input || !btn || !msg) return;

    if (wrap.dataset.mhyInit === "true") return;
    wrap.dataset.mhyInit = "true";

    btn.addEventListener("click", function () {
      const value = (input.value || "").trim();
      const isValid = /^[0-9]{6}$/.test(value);
      if (!isValid) {
        msg.textContent = "Please enter a valid 6-digit pincode.";
        return;
      }
      msg.textContent = "Delivery availability will be confirmed at checkout.";
    });
  }

  function initQuickviewEnhancements(context) {
    if (!context || context.dataset.mhyQuickviewInit === "true") return;
    context.dataset.mhyQuickviewInit = "true";

    const heading = context.querySelector("[data-mhy-qv-heading]");
    if (heading) {
      if (STATE.intent === "buy") heading.textContent = "BUY NOW";
      else if (STATE.intent === "add") heading.textContent = "ADD TO BAG";
      else heading.textContent = "QUICK VIEW";
    }

    if (requiresExplicitSizeSelection(context)) {
      context.dataset.mhySizeSelected = "false";
      const variantsWrap = context.querySelector("[data-mhy-qv-variants]");
      if (variantsWrap) variantsWrap.classList.add("mhy-qv--needs-selection");
    } else {
      context.dataset.mhySizeSelected = "true";
    }

    const sizeHandle = context.getAttribute("data-size-option-handle");
    const sizeName = context.getAttribute("data-size-option-name");
    if (sizeHandle || sizeName) {
      const variantsWrap = context.querySelector("[data-mhy-qv-variants]");

      context.addEventListener("change", function (e) {
        if (!variantsWrap) return;
        if (!variantsWrap.contains(e.target)) return;
        if (e.isTrusted !== true) return;

        const target = e.target;
        if (!target) return;

        if (sizeHandle && target.matches && target.matches(`input[name="${cssEscape(sizeHandle)}"]`)) markSizeSelected(context);
        if (sizeName && target.matches && target.matches(`select[name="options[${cssEscape(sizeName)}]"]`)) markSizeSelected(context);
      });

      context.addEventListener("click", function (e) {
        if (e.isTrusted !== true) return;
        const target = e.target;
        if (!target) return;
        if (!variantsWrap || !variantsWrap.contains(target)) return;

        const input = target.matches("input") ? target : target.closest("input");
        if (input && sizeHandle && input.name === sizeHandle) {
          markSizeSelected(context);
        }
      });
    } else {
      const variantsWrap = context.querySelector("[data-mhy-qv-variants]");
      if (variantsWrap) {
        context.addEventListener("change", function (e) {
          if (e.isTrusted !== true) return;
          if (variantsWrap.contains(e.target)) markSizeSelected(context);
        });
      }
    }

    context.addEventListener(
      "click",
      function (e) {
        const submit = e.target && e.target.closest ? e.target.closest(".js-ajax-submit") : null;
        if (!submit) return;
        if (!context.contains(submit)) return;

        if (shouldBlockForMissingSize(context)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          setValidationState(context, false);
        }
      },
      true
    );

    const buyNow = context.querySelector("[data-mhy-qv-buy-now]");
    if (buyNow) {
      buyNow.addEventListener("click", async function () {
        if (shouldBlockForMissingSize(context)) {
          setValidationState(context, false);
          return;
        }

        const form = buyNow.closest("form");
        if (!form) return;
        const variantInput = form.querySelector('input[name="id"]');
        const qtyInput = form.querySelector('input[name="quantity"]');
        const id = variantInput ? parseInt(variantInput.value, 10) : NaN;
        const quantity = qtyInput ? parseInt(qtyInput.value, 10) : 1;
        if (!id || Number.isNaN(id)) return;

        buyNow.disabled = true;
        try {
          const res = await fetch(window.Shopify.routes.root + "cart/add.js", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ items: [{ id: id, quantity: quantity || 1 }] })
          });

          if (!res.ok) {
            setValidationState(context, false);
            return;
          }

          window.location.href = window.Shopify.routes.root + "checkout";
        } catch (err) {
          setValidationState(context, false);
        } finally {
          buyNow.disabled = false;
        }
      });
    }

    initDelivery(context);
  }

  function observeQuickview() {
    const container = document.querySelector(".js-quickview-content");
    if (!container) return;

    const initIfPresent = () => {
      const context = container.querySelector(".js-quickview-wrapper");
      if (context) initQuickviewEnhancements(context);
    };

    initIfPresent();

    const observer = new MutationObserver(initIfPresent);
    observer.observe(container, { childList: true, subtree: true });
  }

  document.addEventListener(
    "click",
    function (e) {
      const intent = getIntentFromClickTarget(e.target);
      if (intent) STATE.intent = intent;
    },
    true
  );

  if (ENABLE_CUSTOM_QUICK_ACTIONS) {
    document.addEventListener("DOMContentLoaded", function () {
      observeQuickview();
    });

    document.addEventListener("shopify:section:load", function () {
      observeQuickview();
    });
  }

  function initProductPageSizeGate() {
    if (!document.body.classList.contains("template-product")) return;

    const variantsWrap =
      document.querySelector(".template-product .product__variants-swatches") ||
      document.querySelector(".template-product .product__variants-select");
    if (!variantsWrap) return;

    const requiresSize =
      variantsWrap.querySelector(".swatches__option-name.size, .swatches__option-name.sizes") ||
      Array.from(variantsWrap.querySelectorAll("label.form__label")).some((el) => /size/i.test(el.textContent || ""));
    if (!requiresSize) return;

    if (variantsWrap.dataset.mhyPdpGateInit === "true") return;
    variantsWrap.dataset.mhyPdpGateInit = "true";
    document.body.dataset.mhyPdpSizeSelected = "false";

    let validation = document.querySelector(".template-product .mhy-size-validation");
    if (!validation) {
      validation = document.createElement("div");
      validation.className = "mhy-size-validation";
      validation.setAttribute("role", "alert");
      validation.setAttribute("aria-live", "polite");
      validation.hidden = true;
      variantsWrap.insertAdjacentElement("afterend", validation);
    }

    function setValid(isValid) {
      if (isValid) {
        validation.hidden = true;
        variantsWrap.classList.remove("mhy-pdp--invalid");
        return;
      }

      validation.textContent = "Please select a size.";
      validation.hidden = false;
      variantsWrap.classList.remove("mhy-pdp--invalid");
      variantsWrap.offsetWidth;
      variantsWrap.classList.add("mhy-pdp--invalid");
    }

    function markSelected() {
      document.body.dataset.mhyPdpSizeSelected = "true";
      setValid(true);
      variantsWrap.classList.remove("mhy-pdp--needs-selection");
    }

    variantsWrap.addEventListener("click", function (e) {
      if (e.isTrusted !== true) return;
      const input = e.target && e.target.closest ? e.target.closest('input[type="radio"]') : null;
      if (input) markSelected();
    });

    variantsWrap.addEventListener("change", function (e) {
      if (e.isTrusted !== true) return;
      const target = e.target;
      if (!target) return;
      if (target.matches('select[name^="options["]')) markSelected();
    });

    variantsWrap.classList.add("mhy-pdp--needs-selection");

    document.addEventListener(
      "click",
      function (e) {
        const addBtn = e.target && e.target.closest ? e.target.closest(".template-product .js-ajax-submit") : null;
        const buyBtn = e.target && e.target.closest ? e.target.closest(".template-product .shopify-payment-button__button") : null;
        if (!addBtn && !buyBtn) return;

        if (document.body.dataset.mhyPdpSizeSelected !== "true") {
          e.preventDefault();
          e.stopImmediatePropagation();
          setValid(false);
        }
      },
      true
    );
  }

  document.addEventListener("DOMContentLoaded", function () {
    initProductPageSizeGate();
  });

  document.addEventListener("shopify:section:load", function () {
    initProductPageSizeGate();
  });
})();

(function () {
  function openSearch() {
    const content = document.querySelector('[data-wau-modal-content="search-modal"]');
    if (content && window.WAU && WAU.Modal && typeof WAU.Modal.init === "function" && typeof WAU.Modal._openByName === "function") {
      WAU.Modal.init("search-modal");
      WAU.Modal._openByName("search-modal");
      return true;
    }
    return false;
  }

  document.addEventListener(
    "click",
    function (e) {
      const btn = e.target && e.target.closest ? e.target.closest("[data-mhy-mobile-nav-search]") : null;
      if (!btn) return;
      e.preventDefault();
      if (openSearch()) return;
      const url = btn.getAttribute("data-fallback-url") || "/search";
      window.location.href = url;
    },
    true
  );
})();

(function () {
  function isInViewport(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const vw = window.innerWidth || document.documentElement.clientWidth;
    if (rect.width === 0 || rect.height === 0) return false;
    return rect.bottom > 0 && rect.right > 0 && rect.top < vh && rect.left < vw;
  }

  function getVariantWrap() {
    return (
      document.querySelector(".template-product .product__variants-swatches") ||
      document.querySelector(".template-product .product__variants-select")
    );
  }

  function showVariantValidation(message) {
    const variantsWrap = getVariantWrap();
    if (!variantsWrap) return;

    let validation = document.querySelector(".template-product .mhy-size-validation");
    if (!validation) {
      validation = document.createElement("div");
      validation.className = "mhy-size-validation";
      validation.setAttribute("role", "alert");
      validation.setAttribute("aria-live", "polite");
      validation.hidden = true;
      variantsWrap.insertAdjacentElement("afterend", validation);
    }

    validation.textContent = message || "Please select a size to continue.";
    validation.hidden = false;
    variantsWrap.classList.remove("mhy-pdp--invalid");
    variantsWrap.offsetWidth;
    variantsWrap.classList.add("mhy-pdp--invalid");

    const firstControl =
      variantsWrap.querySelector('input[type="radio"], select[name^="options["]') ||
      variantsWrap.querySelector("button, [tabindex]");
    if (firstControl && typeof firstControl.focus === "function") {
      firstControl.focus({ preventScroll: true });
    }

    variantsWrap.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function initStickyATC() {
    if (!document.body.classList.contains("template-product")) return;

    const sticky = document.querySelector("[data-mhy-sticky-atc]");
    const stickyBtn = document.querySelector("[data-mhy-sticky-atc-btn]");
    if (!sticky || !stickyBtn) return;

    const stickyImage = sticky.querySelector("[data-mhy-sticky-image]");
    const stickyVariantTitle = sticky.querySelector("[data-mhy-sticky-variant-title]");
    const stickySelect = sticky.querySelector("[data-mhy-sticky-variant-select]");
    const variantIdInput = document.querySelector(".formVariantId");

    const stickyPriceCurrent = sticky.querySelector("[data-mhy-sticky-price-current]");
    const stickyPriceCompare = sticky.querySelector("[data-mhy-sticky-price-compare]");
    const stickySave = sticky.querySelector("[data-mhy-sticky-save]");

    const mainAtc = document.querySelector(".template-product .product__section--buttons .js-ajax-submit");
    const buyNow = document.querySelector(".template-product .shopify-payment-button__button");
    const mainPrice = document.querySelector(".template-product [data-price]");
    if (!mainAtc) return;

    if (sticky.dataset.mhyInit === "true") return;
    sticky.dataset.mhyInit = "true";

    // Move to body to prevent stacking context bugs (e.g. parent transform/filter/will-change)
    if (sticky.parentNode !== document.body) {
      document.body.appendChild(sticky);
    }

    let productData = null;
    try {
      const productJsonEl = document.querySelector(".product-json");
      if (productJsonEl) productData = JSON.parse(productJsonEl.innerHTML || "null");
    } catch (e) {
      console.warn("Could not parse product data JSON", e);
    }

    let footerInView = false;

    const stickyQtyVal = sticky.querySelector("[data-mhy-sticky-qty-value]");

    function syncStickyVariantDetails() {
      if (!productData || !variantIdInput) return;
      const variantId = variantIdInput.value;
      const variant = productData.variants.find(v => String(v.id) === String(variantId));
      if (!variant) return;

      // Update selected options text representation
      if (variant.options) {
        variant.options.forEach((optValue, idx) => {
          const valEl = sticky.querySelector(`[data-sticky-option-value="${idx}"]`);
          if (valEl) {
            valEl.textContent = optValue;
          }
        });
      }

      if (stickyImage && variant.featured_image && variant.featured_image.src) {
        stickyImage.src = variant.featured_image.src;
      }

      if (stickySelect) {
        stickySelect.value = variantId;
      }
    }

    function syncStickyPricing() {
      if (!mainPrice || !stickyPriceCurrent) return;

      const onSale = mainPrice.classList.contains("price--on-sale");
      const salePriceEl = mainPrice.querySelector("[data-sale-price]");
      const regularEls = mainPrice.querySelectorAll("[data-regular-price]");
      const saleBadge = mainPrice.querySelector(".price__badge--sale");

      let currentText = "";
      let compareText = "";
      let saveText = "";

      if (onSale && salePriceEl) {
        currentText = (salePriceEl.textContent || "").trim();
        if (regularEls && regularEls.length > 1) compareText = (regularEls[1].textContent || "").trim();
        if (saleBadge) saveText = (saleBadge.textContent || "").trim();
      } else if (regularEls && regularEls.length) {
        currentText = (regularEls[0].textContent || "").trim();
      }

      stickyPriceCurrent.textContent = currentText;

      const saleInfoEl = sticky.querySelector("[data-mhy-sticky-sale-info]");
      if (saleInfoEl) {
        saleInfoEl.hidden = !compareText;
      }

      if (stickyPriceCompare) {
        if (compareText) {
          stickyPriceCompare.textContent = compareText;
          stickyPriceCompare.hidden = false;
        } else {
          stickyPriceCompare.textContent = "";
          stickyPriceCompare.hidden = true;
        }
      }

      if (stickySave) {
        if (saveText) {
          stickySave.textContent = saveText.replace(/\s+/g, " ").trim();
          stickySave.hidden = false;
        } else {
          stickySave.textContent = "";
          stickySave.hidden = true;
        }
      }
    }

    function syncStickyQuantity() {
      const mainQtyInput = document.querySelector(".template-product input[name='quantity']");
      if (mainQtyInput && stickyQtyVal) {
        stickyQtyVal.textContent = mainQtyInput.value || "1";
      }
    }

    function syncStickyButtonState() {
      if (!mainAtc || !stickyBtn) return;

      const isDisabled = mainAtc.hasAttribute("disabled") || mainAtc.classList.contains("disabled");
      const btnVal = (mainAtc.value || mainAtc.textContent || "").trim().toUpperCase();
      const isAdding = btnVal.indexOf("ADDING") > -1 || mainAtc.classList.contains("loading") || mainAtc.classList.contains("is-loading");
      const isAdded = btnVal.indexOf("ADDED") > -1;

      stickyBtn.disabled = isDisabled;
      stickyBtn.classList.toggle("disabled", isDisabled);

      const btnTextEl = stickyBtn.querySelector(".mhy-sticky-atc__btn-text");
      const loaderEl = stickyBtn.querySelector(".mhy-sticky-atc__btn-loader");

      if (isAdding) {
        if (btnTextEl) btnTextEl.textContent = "";
        if (loaderEl) loaderEl.hidden = false;
        stickyBtn.classList.add("mhy-btn-loading");
      } else if (isAdded) {
        if (btnTextEl) btnTextEl.textContent = "✓ Added to Cart";
        if (loaderEl) loaderEl.hidden = true;
        stickyBtn.classList.remove("mhy-btn-loading");
        stickyBtn.classList.add("mhy-btn-success");
      } else {
        if (btnTextEl) btnTextEl.textContent = mainAtc.value || mainAtc.textContent || "Add to Cart";
        if (loaderEl) loaderEl.hidden = true;
        stickyBtn.classList.remove("mhy-btn-loading");
        stickyBtn.classList.remove("mhy-btn-success");
      }

      syncStickyPricing();
      syncStickyVariantDetails();
      syncStickyQuantity();
    }

    function setVisible(visible) {
      sticky.hidden = !visible;
      sticky.dataset.visible = visible ? "true" : "false";
      document.body.classList.toggle("mhy-has-sticky-atc", visible);
    }

    function updateVisibility() {
      if (footerInView) {
        setVisible(false);
        return;
      }
      const atcVisible = isInViewport(mainAtc);
      const buyVisible = buyNow ? isInViewport(buyNow) : true;
      const shouldHide = atcVisible && buyVisible;
      setVisible(!shouldHide);
    }

    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        () => updateVisibility(),
        { root: null, threshold: [0, 0.5, 0.9, 1] }
      );
      io.observe(mainAtc);
      if (buyNow) io.observe(buyNow);
    }

    window.addEventListener("scroll", function () {
      updateVisibility();
    }, { passive: true });
    window.addEventListener("resize", function () {
      updateVisibility();
    });

    const mo = new MutationObserver(function () {
      syncStickyButtonState();
    });
    mo.observe(mainAtc, { attributes: true, attributeFilter: ["disabled", "value", "class"] });

    document.querySelectorAll(".formVariantId").forEach((input) => {
      input.addEventListener("change", function () {
        syncStickyButtonState();
      });
    });

    if (stickySelect) {
      stickySelect.addEventListener("change", function () {
        const val = this.value;
        if (variantIdInput) {
          variantIdInput.value = val;
          variantIdInput.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
    }

    // Sync quantity updates from main inputs to sticky text
    document.querySelectorAll(".template-product input[name='quantity']").forEach((input) => {
      input.addEventListener("change", function () {
        syncStickyQuantity();
      });
      input.addEventListener("input", function () {
        syncStickyQuantity();
      });
    });

    // Handle sticky quantity increment/decrement clicks
    sticky.addEventListener("click", function (e) {
      const decBtn = e.target.closest("[data-qty-decrement]");
      const incBtn = e.target.closest("[data-qty-increment]");

      if (decBtn || incBtn) {
        let currentQty = parseInt(stickyQtyVal.textContent, 10) || 1;
        if (decBtn && currentQty > 1) {
          currentQty--;
        } else if (incBtn) {
          currentQty++;
        }
        stickyQtyVal.textContent = currentQty;

        // Sync back to all main quantity inputs
        document.querySelectorAll(".template-product input[name='quantity']").forEach((input) => {
          input.value = currentQty;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        });
      }
    });

    if (mainPrice) {
      const priceObserver = new MutationObserver(function () {
        syncStickyPricing();
      });
      priceObserver.observe(mainPrice, { attributes: true, childList: true, subtree: true });
    }

    const footerEl = document.querySelector(".footer") || document.querySelector("footer");
    if (footerEl && "IntersectionObserver" in window) {
      const footerObserver = new IntersectionObserver(
        (entries) => {
          footerInView = entries.some((e) => e.isIntersecting);
          updateVisibility();
        },
        { root: null, threshold: 0.01 }
      );
      footerObserver.observe(footerEl);
    }

    stickyBtn.addEventListener("click", function () {
      const gateExists = typeof document.body.dataset.mhyPdpSizeSelected !== "undefined";
      const gateOk = document.body.dataset.mhyPdpSizeSelected === "true";
      if (gateExists && !gateOk) {
        showVariantValidation("Please select a size to continue.");
        return;
      }
      syncStickyButtonState();
      mainAtc.click();
    });

    syncStickyButtonState();
    updateVisibility();
    setTimeout(updateVisibility, 250);
  }

  document.addEventListener("DOMContentLoaded", initStickyATC);
  document.addEventListener("shopify:section:load", initStickyATC);
})();

(function () {
  function initCollectionSortFilterUI() {
    // 1. Desktop Toolbar Pill Dropdowns
    const desktopForm = document.getElementById("CollectionFiltersForm");
    if (desktopForm && !desktopForm.dataset.mhyDtInit) {
      desktopForm.dataset.mhyDtInit = "true";

      // Restore previously open dropdown if index is saved
      if (typeof window.mhyLastOpenDropdownIndex === "number" && window.mhyLastOpenDropdownIndex !== -1) {
        const pills = desktopForm.querySelectorAll("[data-mhy-dt-filter]");
        if (pills[window.mhyLastOpenDropdownIndex]) {
          const dropdown = pills[window.mhyLastOpenDropdownIndex].querySelector("[data-mhy-dt-dropdown]");
          if (dropdown) dropdown.hidden = false;
        }
      }

      desktopForm.addEventListener("click", function (e) {
        const trigger = e.target.closest("[data-mhy-dt-trigger]");
        if (trigger) {
          e.preventDefault();
          const pill = trigger.closest("[data-mhy-dt-filter]");
          const dropdown = pill ? pill.querySelector("[data-mhy-dt-dropdown]") : null;
          if (dropdown) {
            const isHidden = dropdown.hidden;
            desktopForm.querySelectorAll("[data-mhy-dt-dropdown]").forEach(d => d.hidden = true);
            dropdown.hidden = !isHidden;

            if (!isHidden) {
              window.mhyLastOpenDropdownIndex = -1;
            } else {
              const pills = Array.from(desktopForm.querySelectorAll("[data-mhy-dt-filter]"));
              window.mhyLastOpenDropdownIndex = pills.indexOf(pill);
            }
          }
          return;
        }

        const sortTrigger = e.target.closest("[data-mhy-sort-trigger]");
        if (sortTrigger) {
          e.preventDefault();
          const sortPill = sortTrigger.closest("[data-mhy-sort]");
          const sortDropdown = sortPill ? sortPill.querySelector("[data-mhy-sort-dropdown]") : null;
          if (sortDropdown) {
            const isHidden = sortDropdown.hidden;
            desktopForm.querySelectorAll("[data-mhy-dt-dropdown]").forEach(d => d.hidden = true);
            sortDropdown.hidden = !isHidden;
            window.mhyLastOpenDropdownIndex = -1;
          }
          return;
        }

        const sortOption = e.target.closest("[data-mhy-sort-option]");
        if (sortOption) {
          e.preventDefault();
          const value = sortOption.getAttribute("data-mhy-sort-option");
          const name = sortOption.getAttribute("data-mhy-sort-name") || sortOption.textContent;
          const params = new URLSearchParams(window.location.search);

          const currentFormData = new FormData(desktopForm);
          for (let [k, v] of currentFormData.entries()) {
            if (k !== "sort_by") params.set(k, v);
          }
          params.set("sort_by", value);

          document.querySelectorAll("[data-mhy-sort-dropdown]").forEach(d => d.hidden = true);
          document.querySelectorAll("[data-mhy-sort-active]").forEach(el => el.textContent = (name || "").trim());

          window.mhyLastOpenDropdownIndex = -1;

          if (window.theme && theme.CollectionFilters && typeof theme.CollectionFilters.renderPage === "function") {
            theme.CollectionFilters.renderPage(params.toString());
          } else {
            window.location.search = params.toString();
          }
          return;
        }

        if (!e.target.closest("[data-mhy-dt-filter]") && !e.target.closest("[data-mhy-sort]")) {
          desktopForm.querySelectorAll("[data-mhy-dt-dropdown]").forEach(d => d.hidden = true);
          desktopForm.querySelectorAll("[data-mhy-sort-dropdown]").forEach(d => d.hidden = true);
          window.mhyLastOpenDropdownIndex = -1;
        }
      });

      desktopForm.addEventListener("change", function (e) {
        const formData = new FormData(desktopForm);
        const searchParams = new URLSearchParams(formData).toString();
        if (window.theme && theme.CollectionFilters && typeof theme.CollectionFilters.renderPage === "function") {
          theme.CollectionFilters.renderPage(searchParams);
        }
      });

      document.addEventListener("click", function (e) {
        if (desktopForm && !desktopForm.contains(e.target)) {
          desktopForm.querySelectorAll("[data-mhy-dt-dropdown]").forEach(d => d.hidden = true);
          desktopForm.querySelectorAll("[data-mhy-sort-dropdown]").forEach(d => d.hidden = true);
          window.mhyLastOpenDropdownIndex = -1;
        }
      });
    }

    // 2. Mobile Toolbar & Sidebar UI
    const toolbar = document.querySelector("[data-mhy-collection-sf]");
    if (!toolbar) return;
    
    if (toolbar.dataset.mhyInit === "true") return;
    toolbar.dataset.mhyInit = "true";

    const sortWrap = toolbar.querySelector("[data-mhy-sort]");
    const sortTrigger = toolbar.querySelector("[data-mhy-sort-trigger]");
    const sortDropdown = toolbar.querySelector("[data-mhy-sort-dropdown]");
    const sortActive = toolbar.querySelector("[data-mhy-sort-active]");

    const sidebar = document.getElementById("sidebar");
    let overlay = document.querySelector(".sidebar-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "sidebar-overlay";
      document.body.appendChild(overlay);
    }

    function closeSort() {
      if (!sortDropdown || !sortTrigger) return;
      sortDropdown.hidden = true;
      sortTrigger.setAttribute("aria-expanded", "false");
    }

    function openSort() {
      if (!sortDropdown || !sortTrigger) return;
      sortDropdown.hidden = false;
      sortTrigger.setAttribute("aria-expanded", "true");
    }

    function toggleSort() {
      if (!sortDropdown) return;
      if (sortDropdown.hidden) openSort();
      else closeSort();
    }

    if (sortTrigger && sortDropdown) {
      sortTrigger.addEventListener("click", function (e) {
        e.preventDefault();
        toggleSort();
      });

      sortDropdown.addEventListener("click", function (e) {
        const optionBtn = e.target.closest("[data-mhy-sort-option]");
        if (!optionBtn) return;

        const value = optionBtn.getAttribute("data-mhy-sort-option");
        const name = optionBtn.getAttribute("data-mhy-sort-name") || optionBtn.textContent;
        const params = new URLSearchParams(window.location.search);
        
        const sideForm = document.getElementById("CollectionSidebarFiltersForm");
        if (sideForm) {
          const sideData = new FormData(sideForm);
          for (let [k, v] of sideData.entries()) {
            if (k !== "sort_by") params.append(k, v);
          }
        }
        params.set("sort_by", value);

        if (sortActive) sortActive.textContent = (name || "").trim();

        sortDropdown.querySelectorAll(".mhy-collection-sf__option").forEach((btn) => {
          const isActive = btn === optionBtn;
          btn.classList.toggle("is-active", isActive);
          btn.setAttribute("aria-selected", isActive ? "true" : "false");
        });

        closeSort();

        if (window.theme && theme.CollectionFilters && typeof theme.CollectionFilters.renderPage === "function") {
          theme.CollectionFilters.renderPage(params.toString());
        } else {
          const qs = params.toString();
          window.location.search = qs ? "?" + qs : "";
        }
      });

      document.addEventListener(
        "click",
        function (e) {
          if (!sortDropdown || sortDropdown.hidden) return;
          if (sortWrap && sortWrap.contains(e.target)) return;
          closeSort();
        },
        true
      );

      document.addEventListener("keydown", function (e) {
        if (e.key !== "Escape") return;
        closeSort();
      });
    }

    function syncOverlay() {
      if (!sidebar || !overlay) return;
      const isOpen = sidebar.classList.contains("open") || sidebar.classList.contains("active");
      overlay.classList.toggle("active", isOpen);
      document.body.classList.toggle("sidebar-open", isOpen);
    }

    if (sidebar) {
      const sidebarObserver = new MutationObserver(syncOverlay);
      sidebarObserver.observe(sidebar, { attributes: true, attributeFilter: ["class"] });
      syncOverlay();
    }

    overlay.addEventListener("click", function () {
      if (!sidebar) return;
      sidebar.classList.remove("open");
      sidebar.classList.remove("active");
      overlay.classList.remove("active");
      document.body.classList.remove("sidebar-open");
    });
  }

  window.initCollectionSortFilterUI = initCollectionSortFilterUI;
  document.addEventListener("DOMContentLoaded", initCollectionSortFilterUI);
  document.addEventListener("shopify:section:load", initCollectionSortFilterUI);
})();

(function () {
  function parseJsonScript(el, selector) {
    const script = el.querySelector(selector);
    if (!script) return null;
    try {
      return JSON.parse(script.textContent || "null");
    } catch (e) {
      return null;
    }
  }

  function initProductCardCarousel(card) {
    const carousel = card.querySelector("[data-pc-carousel]");
    if (!carousel) return;
    if (carousel.dataset.pcCarouselInit === "true") return;
    carousel.dataset.pcCarouselInit = "true";

    const slides = Array.from(carousel.querySelectorAll("[data-pc-slide]"));
    if (slides.length <= 1) return;

    const reduceMotion =
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    const intervalAttr = carousel.getAttribute("data-pc-carousel-interval");
    const intervalMs = Math.max(800, parseInt(intervalAttr || "2000", 10) || 2000);

    let index = 0;
    let timerId = null;
    let canRun = false;

    slides.forEach((s, i) => s.classList.toggle("is-active", i === 0));

    function preloadSlide(i) {
      const slide = slides[i];
      if (!slide) return;
      const img = slide.querySelector("img");
      if (!img) return;
      const src = img.currentSrc || img.getAttribute("src");
      if (!src) return;
      const pre = new Image();
      pre.src = src;
    }

    function preloadNextFew() {
      for (let offset = 1; offset <= 2; offset++) {
        const nextIdx = (index + offset) % slides.length;
        preloadSlide(nextIdx);
      }
    }

    function show(nextIndex) {
      if (nextIndex === index) return;
      const prev = slides[index];
      const next = slides[nextIndex];
      if (!prev || !next) return;
      prev.classList.remove("is-active");
      next.classList.add("is-active");
      index = nextIndex;
      preloadNextFew();
    }

    function tick() {
      show((index + 1) % slides.length);
    }

    function start() {
      if (!canRun) return;
      if (timerId) return;
      timerId = window.setInterval(tick, intervalMs);
    }

    function stop() {
      if (!timerId) return;
      window.clearInterval(timerId);
      timerId = null;
    }

    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          const entry = entries && entries[0];
          if (!entry) return;
          if (entry.isIntersecting) {
            canRun = true;
            preloadNextFew();
            start();
          } else {
            canRun = false;
            stop();
          }
        },
        { rootMargin: "200px 0px" }
      );
      io.observe(carousel);
      carousel._pcCarouselIO = io;
    } else {
      canRun = true;
      preloadNextFew();
      start();
    }

    if (window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      card.addEventListener("mouseenter", stop);
      card.addEventListener("mouseleave", start);
      card.addEventListener("focusin", stop);
      card.addEventListener("focusout", start);
    }
  }

  function initPremiumProductCards() {
    const cards = document.querySelectorAll("[data-pc-card]");
    if (!cards || !cards.length) return;

    const sizeGuideModal = document.getElementById("modal-mhy-size-guide");
    const sizeGuideImg = document.querySelector("[data-mhy-size-guide-img]");

    cards.forEach((card) => {
      if (card.dataset.pcInit === "true") return;
      card.dataset.pcInit = "true";

      initProductCardCarousel(card);

      const variants = parseJsonScript(card, 'script[data-pc-variant-data]');
      if (!variants || !Array.isArray(variants) || !variants.length) return;

      const requiresSize = card.getAttribute("data-pc-requires-size") === "true";
      const requiresColor = card.getAttribute("data-pc-requires-color") === "true";
      const sizeIndexAttr = card.getAttribute("data-pc-size-index");
      const colorIndexAttr = card.getAttribute("data-pc-color-index");
      const sizeIndex = sizeIndexAttr !== null ? parseInt(sizeIndexAttr, 10) : null;
      const colorIndex = colorIndexAttr !== null ? parseInt(colorIndexAttr, 10) : null;

      const selected = {};
      const priceEl = card.querySelector("[data-pc-price]");
      const compareEl = card.querySelector("[data-pc-compare]");
      const offerEl = card.querySelector("[data-pc-offer]");
      const variantIdInput = card.querySelector("[data-pc-variant-id]");
      const atcBtn = card.querySelector("[data-pc-atc]");
      const buyBtn = card.querySelector("[data-pc-buy-now]");
      const validation = card.querySelector("[data-pc-validation]");
      const atcForm = card.querySelector("form.pc-form");

      const defaultAtcText = atcBtn ? (atcBtn.value || "Add to Cart") : "";
      const defaultBuyText = buyBtn ? (buyBtn.textContent || "Buy Now") : "";
      let isSubmitting = false;

      let defaultColorValue = null;
      if (requiresColor && typeof colorIndex === "number") {
        const firstAvailable = variants.find((v) => v && v.available) || variants[0];
        if (firstAvailable && Array.isArray(firstAvailable.options)) {
          defaultColorValue = firstAvailable.options[colorIndex] || null;
        }
      }

      if ((requiresSize || requiresColor) && variantIdInput) {
        variantIdInput.value = "";
      }

      card.querySelectorAll(".pc-pill.is-selected, .pc-swatch.is-selected").forEach((el) => {
        el.classList.remove("is-selected");
        el.setAttribute("aria-pressed", "false");
      });

      card.querySelectorAll("[data-pc-option]").forEach((wrap) => {
        const label = wrap.querySelector("[data-pc-selected-label]");
        if (!label) return;
        if (wrap.classList.contains("pc-opt--size")) label.textContent = "Select size";
        else if (wrap.classList.contains("pc-opt--color")) label.textContent = "Select color";
      });

      function setValidation(message) {
        if (!validation) return;
        validation.textContent = message;
        validation.hidden = !message;
        card.classList.toggle("is-invalid", Boolean(message));
        if (message) {
          setTimeout(function () {
            card.classList.remove("is-invalid");
          }, 320);
        }
      }

      function moneyValue(v, key) {
        const val = v && v[key];
        return typeof val === "string" ? val : "";
      }

      function updatePriceForVariant(v) {
        if (!priceEl || !v) return;
        priceEl.textContent = moneyValue(v, "price_formatted") || priceEl.textContent;

        const onSale = typeof v.compare_at_price === "number" && v.compare_at_price > v.price;
        if (compareEl) {
          compareEl.textContent = onSale ? moneyValue(v, "compare_formatted") : "";
          compareEl.hidden = !onSale;
        }
        if (offerEl) {
          offerEl.textContent = onSale ? String(v.discount_percent || 0) + "% OFF" : "";
          offerEl.hidden = !onSale;
        }
      }

      function hasAvailableVariantWith(optionIndex, optionValue) {
        return variants.some((v) => {
          if (!v || !v.available || !Array.isArray(v.options)) return false;
          if (v.options[optionIndex] !== optionValue) return false;
          for (const key in selected) {
            const idx = parseInt(key, 10);
            if (idx === optionIndex) continue;
            if (v.options[idx] !== selected[idx]) return false;
          }
          return true;
        });
      }

      function updateOptionAvailability() {
        card.querySelectorAll("[data-pc-option]").forEach((optionWrap) => {
          const optionIndexAttr = optionWrap.getAttribute("data-pc-option-index");
          if (optionIndexAttr === null) return;
          const optionIndex = parseInt(optionIndexAttr, 10);

          optionWrap.querySelectorAll("[data-pc-option-value]").forEach((btn) => {
            const value = btn.getAttribute("data-pc-option-value");
            const available = hasAvailableVariantWith(optionIndex, value);
            btn.classList.toggle("is-unavailable", !available);
            btn.toggleAttribute("disabled", !available);
            if (!available) btn.setAttribute("aria-disabled", "true");
            else btn.removeAttribute("aria-disabled");
          });
        });
      }

      function getValidationMessage() {
        const missingSize = requiresSize && typeof sizeIndex === "number" && !selected.hasOwnProperty(sizeIndex);
        const missingColor = requiresColor && typeof colorIndex === "number" && !selected.hasOwnProperty(colorIndex);
        if (missingSize && missingColor) return "Please select size and color.";
        if (missingSize) return "Please select a size.";
        if (missingColor) return "Please select a color.";
        return "";
      }

      function findVariant() {
        const required = [];
        if (requiresSize && typeof sizeIndex === "number") required.push(sizeIndex);
        if (requiresColor && typeof colorIndex === "number") required.push(colorIndex);

        for (let i = 0; i < required.length; i++) {
          if (!selected.hasOwnProperty(required[i])) return null;
        }

        return (
          variants.find((v) => {
            if (!v || !v.options) return false;
            for (let i = 0; i < required.length; i++) {
              const idx = required[i];
              if (v.options[idx] !== selected[idx]) return false;
            }
            return true;
          }) || null
        );
      }

      function syncButtons() {
        const v = findVariant();
        const hasVariant = Boolean(v && v.id);
        const isAvailable = Boolean(v && v.available);

        if (variantIdInput && hasVariant) variantIdInput.value = String(v.id);
        if (hasVariant) updatePriceForVariant(v);

        if (atcBtn) {
          atcBtn.disabled = hasVariant && !isAvailable;
          atcBtn.value = hasVariant && !isAvailable ? "Sold Out" : defaultAtcText;
        }
        if (buyBtn) {
          buyBtn.disabled = hasVariant && !isAvailable;
          buyBtn.textContent = hasVariant && !isAvailable ? "Sold Out" : defaultBuyText;
        }
      }

      function setSelected(optionWrap, optionIndex, optionValue) {
        selected[optionIndex] = optionValue;

        optionWrap.querySelectorAll("[data-pc-option-value]").forEach((btn) => {
          const isSelected = btn.getAttribute("data-pc-option-value") === optionValue;
          btn.classList.toggle("is-selected", isSelected);
          btn.setAttribute("aria-pressed", isSelected ? "true" : "false");
        });

        const label = optionWrap.querySelector("[data-pc-selected-label]");
        if (label) label.textContent = optionValue;

        setValidation("");
        syncButtons();
        updateOptionAvailability();
      }

      card.querySelectorAll("[data-pc-option]").forEach((optionWrap) => {
        const optionIndexAttr = optionWrap.getAttribute("data-pc-option-index");
        if (optionIndexAttr === null) return;
        const optionIndex = parseInt(optionIndexAttr, 10);
        optionWrap.addEventListener("click", function (e) {
          const btn = e.target.closest("[data-pc-option-value]");
          if (!btn) return;
          if (btn.hasAttribute("disabled") || btn.classList.contains("is-unavailable")) return;
          e.preventDefault();
          setSelected(optionWrap, optionIndex, btn.getAttribute("data-pc-option-value"));
        });
      });

      if (defaultColorValue && typeof colorIndex === "number") {
        const colorWrap = card.querySelector('[data-pc-option][data-pc-option-index="' + String(colorIndex) + '"]');
        if (colorWrap) setSelected(colorWrap, colorIndex, defaultColorValue);
      }

      if (atcBtn) {
        atcBtn.addEventListener(
          "click",
          function (e) {
            e.preventDefault();
            e.stopImmediatePropagation();

            if (isSubmitting) return;

            const msg = getValidationMessage();
            if (msg) {
              setValidation(msg);
              return;
            }

            const v = findVariant();
            if (!v || !v.id) {
              setValidation("Please select required options to continue.");
              return;
            }
            if (!v.available) {
              setValidation("Sold out.");
              return;
            }

            if (!window.Shopify || !Shopify.theme || !Shopify.theme.cart || !Shopify.theme.ajaxCart) {
              if (atcForm) atcForm.submit();
              return;
            }

            let cartConfigEl = document.getElementById("cart-config");
            let cartConfig = cartConfigEl ? JSON.parse(cartConfigEl.innerHTML || "{}") : {};
            cartConfig.cart_url = cartConfig.cart_url || "/cart";

            isSubmitting = true;
            atcBtn.disabled = true;
            atcBtn.value = "Adding…";

            Shopify.theme.cart
              .addItem(v.id, 1)
              .then(() => Shopify.theme.cart.getCart())
              .then((Cart) => {
                Shopify.theme.ajaxCart.updateView(cartConfig, Cart);
                if (cartConfig.cart_action === "drawer") {
                  Shopify.theme.ajaxCart.showDrawer(cartConfig);
                } else if (cartConfig.cart_action === "modal_cart") {
                  Shopify.theme.ajaxCart.showModal(cartConfig);
                }
                // Cart drawer opens directly — no success banner needed.

                setValidation("");
              })
              .catch((err) => {
                const msg =
                  (err && (err.description || err.message)) ||
                  "Unable to add to cart. Please try again.";
                setValidation(msg);
                Shopify.theme.ajaxCart.setCartNotice(cartConfig, {
                  type: "error",
                  message: msg,
                  autoHideMs: 4500,
                });
              })
              .finally(() => {
                isSubmitting = false;
                atcBtn.disabled = false;
                atcBtn.value = defaultAtcText;
                syncButtons();
              });
          },
          true
        );
      }

      if (buyBtn) {
        buyBtn.addEventListener("click", function (e) {
          e.preventDefault();
          const v = findVariant();
          const msg = getValidationMessage();
          if (msg) {
            setValidation(msg);
            return;
          }
          if (!v || !v.id) {
            setValidation("Please select required options to continue.");
            return;
          }
          if (!v.available) {
            setValidation("Sold out.");
            return;
          }

          buyBtn.disabled = true;
          buyBtn.textContent = "Processing…";

          if (window.Shopify && Shopify.theme && Shopify.theme.cart) {
            Shopify.theme.cart
              .addItem(v.id, 1)
              .then(() => {
                window.location.href = "/checkout";
              })
              .catch((err) => {
                const m =
                  (err && (err.description || err.message)) ||
                  "Unable to proceed to checkout. Please try again.";
                setValidation(m);
                buyBtn.disabled = false;
                buyBtn.textContent = defaultBuyText;
              });
          } else {
            fetch("/cart/add.js", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({ id: v.id, quantity: 1 }),
            })
              .then((res) => {
                if (!res.ok) return res.json().then((j) => Promise.reject(j));
                return res.json();
              })
              .then(() => {
                window.location.href = "/checkout";
              })
              .catch((err) => {
                const m =
                  (err && (err.description || err.message)) ||
                  "Unable to proceed to checkout. Please try again.";
                setValidation(m);
                buyBtn.disabled = false;
                buyBtn.textContent = defaultBuyText;
              });
          }
        });
      }

      const sizeGuideBtn = card.querySelector("[data-pc-size-guide]");
      if (sizeGuideBtn && sizeGuideModal && sizeGuideImg) {
        sizeGuideBtn.addEventListener("click", function (e) {
          e.preventDefault();
          const url = sizeGuideBtn.getAttribute("data-pc-size-guide-url");
          if (!url) return;
          sizeGuideImg.setAttribute("src", url);
          sizeGuideImg.setAttribute("alt", "Size guide");
          if (window.WAU && WAU.Modal && typeof WAU.Modal._openByName === "function") {
            WAU.Modal._openByName("mhy-size-guide", sizeGuideBtn);
          } else {
            window.open(url, "_blank");
          }
        });
      }

      syncButtons();
      updateOptionAvailability();
    });
  }

  document.addEventListener("DOMContentLoaded", initPremiumProductCards);
  document.addEventListener("shopify:section:load", initPremiumProductCards);
})();

/* ==========================================================================
   CART DRAWER RECOMMENDATIONS & QUANTITY BUTTON STATE
   ========================================================================== */
(function () {
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatMoney(cents, format) {
    if (typeof cents === 'string') cents = cents.replace('.', '');
    if (typeof cents !== 'number') cents = parseInt(cents, 10) || 0;

    const moneyFormat = format || (window.theme && window.theme.config && window.theme.config.money_format) || (window.Shopify && window.Shopify.money_format) || 'Rs. {{amount}}';

    if (window.theme && window.theme.Helpers && typeof window.theme.Helpers.formatMoney === 'function') {
      return window.theme.Helpers.formatMoney(cents, moneyFormat);
    }
    if (window.Shopify && typeof window.Shopify.formatMoney === 'function') {
      return window.Shopify.formatMoney(cents, moneyFormat);
    }

    let value = '';
    const placeholderRegex = /\{\{\s*(\w+)\s*\}\}/;

    function formatWithDelimiters(number, precision, thousands, decimal) {
      precision = precision === undefined ? 2 : precision;
      thousands = thousands || ',';
      decimal = decimal || '.';
      if (isNaN(number) || number == null) return '0';

      number = (number / 100.0).toFixed(precision);
      const parts = number.split('.');
      const dollarsAmount = parts[0].replace(/(\d)(?=(\d\d\d)+(?!\d))/g, '$1' + thousands);
      const centsAmount = parts[1] ? decimal + parts[1] : '';
      return dollarsAmount + centsAmount;
    }

    const match = moneyFormat.match(placeholderRegex);
    if (!match) return moneyFormat + ' ' + (cents / 100).toFixed(2);

    switch (match[1]) {
      case 'amount':
        value = formatWithDelimiters(cents, 2, ',', '.');
        break;
      case 'amount_no_decimals':
        value = formatWithDelimiters(cents, 0, ',', '.');
        break;
      case 'amount_with_comma_separator':
        value = formatWithDelimiters(cents, 2, '.', ',');
        break;
      case 'amount_no_decimals_with_comma_separator':
        value = formatWithDelimiters(cents, 0, '.', ',');
        break;
      default:
        value = formatWithDelimiters(cents, 2, ',', '.');
        break;
    }

    return moneyFormat.replace(placeholderRegex, value);
  }

  function renderRecommendations(recWrap, products) {
    const container = recWrap.querySelector('.js-recommendations-container');
    if (!container) return;

    if (!products || products.length === 0) {
      recWrap.style.display = 'none';
      return;
    }

    recWrap.style.display = 'block';
    const limitedProducts = products.slice(0, 4);
    const moneyFormat = recWrap.getAttribute('data-money-format') || (window.theme && window.theme.config && window.theme.config.money_format) || (window.Shopify && window.Shopify.money_format);

    const cardsHtml = limitedProducts
      .map(function (product) {
        const variant =
          (product.variants && product.variants.find(function (v) { return v.available; })) ||
          (product.variants && product.variants[0]);

        const isAvailable = variant && variant.available;
        const imgUrl = product.featured_image || (product.images && product.images[0]) || '';
        const title = product.title || '';
        const price = variant ? variant.price : product.price;
        const comparePrice = variant ? variant.compare_at_price : product.compare_at_price;

        const formattedPrice = formatMoney(price, moneyFormat);
        let compareHtml = '';
        if (comparePrice && comparePrice > price) {
          compareHtml = '<span class="mhy-rec-compare-price">' + formatMoney(comparePrice, moneyFormat) + '</span>';
        }

        const variantId = variant ? variant.id : '';
        const btnLabel = isAvailable ? '+ Add' : 'Sold Out';
        const disabledAttr = isAvailable ? '' : 'disabled="disabled"';
        const soldOutClass = isAvailable ? '' : 'is-sold-out';

        return (
          '<div class="mhy-rec-card">' +
            '<a href="' + product.url + '" class="mhy-rec-img-link">' +
              '<img src="' + imgUrl + '" alt="' + escapeHtml(title) + '" class="mhy-rec-img" loading="lazy" width="70" height="70" />' +
            '</a>' +
            '<div class="mhy-rec-details">' +
              '<a href="' + product.url + '" class="mhy-rec-title" title="' + escapeHtml(title) + '">' + escapeHtml(title) + '</a>' +
              '<div class="mhy-rec-price-row">' +
                '<span class="mhy-rec-price">' + formattedPrice + '</span>' +
                compareHtml +
              '</div>' +
              '<button type="button" class="mhy-rec-add-btn ' + soldOutClass + '" data-variant-id="' + variantId + '" ' + disabledAttr + '>' +
                btnLabel +
              '</button>' +
            '</div>' +
          '</div>'
        );
      })
      .join('');

    container.innerHTML = cardsHtml;
  }

  function fetchRecommendationsForElement(recWrap) {
    const productId = recWrap.getAttribute('data-product-id');
    if (!productId) {
      recWrap.style.display = 'none';
      return;
    }

    if (recWrap.dataset.fetchedId === productId) return;
    recWrap.dataset.fetchedId = productId;

    const url = '/recommendations/products.json?product_id=' + encodeURIComponent(productId) + '&limit=4&intent=related';

    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json();
      })
      .then(function (data) {
        renderRecommendations(recWrap, data.products || []);
      })
      .catch(function (err) {
        console.error('Error fetching cart recommendations:', err);
        recWrap.style.display = 'none';
      });
  }

  function initCartRecommendations() {
    const recWraps = document.querySelectorAll('.js-cart-recommendations');
    recWraps.forEach(function (recWrap) {
      fetchRecommendationsForElement(recWrap);
    });
  }

  function getCartConfig() {
    var el = document.getElementById('cart-config');
    if (el) {
      try {
        var parsed = JSON.parse(el.innerHTML);
        if (parsed && parsed.cart_url) return parsed;
      } catch (e) {}
    }
    return {
      cart_url: (window.Shopify && window.Shopify.routes && window.Shopify.routes.root ? window.Shopify.routes.root + 'cart' : '/cart'),
      money_format: (window.theme && window.theme.config && window.theme.config.money_format) || (window.Shopify && window.Shopify.money_format) || 'Rs. {{amount}}'
    };
  }

  function handleAddToCart(btn) {
    const variantId = btn.getAttribute('data-variant-id');
    if (!variantId || btn.disabled) return;

    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = 'Adding...';

    const config = getCartConfig();
    const rootPath = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';

    fetch(rootPath + 'cart/add.js', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        items: [{ id: parseInt(variantId, 10), quantity: 1 }]
      })
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to add item to cart');
        return res.json();
      })
      .then(function () {
        btn.textContent = 'Added!';

        if (window.Shopify && Shopify.theme && Shopify.theme.cart && Shopify.theme.ajaxCart) {
          Shopify.theme.cart.getCart().then(function (cartState) {
            Shopify.theme.ajaxCart.updateView(config, cartState);
          });
        } else {
          window.location.reload();
        }
      })
      .catch(function (err) {
        console.error('Error adding recommendation to cart:', err);
        btn.textContent = originalText;
        btn.disabled = false;
      });
  }

  function updateQuantityButtonStates() {
    const decreaseBtns = document.querySelectorAll('[data-ajax-qty-decrease]');
    decreaseBtns.forEach(function (btn) {
      const input = btn.nextElementSibling;
      if (input && input.matches('input')) {
        const val = parseInt(input.value, 10) || 1;
        if (val <= 1) {
          btn.setAttribute('disabled', 'disabled');
          btn.setAttribute('data-disabled', 'true');
        } else {
          btn.removeAttribute('disabled');
          btn.removeAttribute('data-disabled');
        }
      }
    });
  }

  function observeCartDrawer() {
    const cartContent = document.querySelector('.js-ajax-cart-content');
    if (!cartContent) return;

    const observer = new MutationObserver(function () {
      initCartRecommendations();
      updateQuantityButtonStates();
    });

    observer.observe(cartContent, { childList: true, subtree: true });
  }

  function handlePdpQuantityControls() {
    document.addEventListener('click', function (e) {
      const downBtn = e.target && e.target.closest ? e.target.closest('.js-pdp-qty-down') : null;
      const upBtn = e.target && e.target.closest ? e.target.closest('.js-pdp-qty-up') : null;

      if (downBtn) {
        e.preventDefault();
        const wrapper = downBtn.closest('.mhy-pdp-qty-wrapper');
        const input = wrapper ? wrapper.querySelector('.js-pdp-qty-input') : null;
        if (input) {
          let val = parseInt(input.value, 10) || 1;
          if (val > 1) val--;
          input.value = val;
          downBtn.disabled = val <= 1;
        }
      }

      if (upBtn) {
        e.preventDefault();
        const wrapper = upBtn.closest('.mhy-pdp-qty-wrapper');
        const input = wrapper ? wrapper.querySelector('.js-pdp-qty-input') : null;
        if (input) {
          let val = parseInt(input.value, 10) || 1;
          val++;
          input.value = val;
          const down = wrapper.querySelector('.js-pdp-qty-down');
          if (down) down.disabled = false;
        }
      }
    });
  }

  document.addEventListener('click', function (e) {
    const recBtn = e.target && e.target.closest ? e.target.closest('.mhy-rec-add-btn') : null;
    if (recBtn) {
      e.preventDefault();
      handleAddToCart(recBtn);
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    initCartRecommendations();
    updateQuantityButtonStates();
    observeCartDrawer();
    handlePdpQuantityControls();
  });

  document.addEventListener('shopify:section:load', function () {
    initCartRecommendations();
    updateQuantityButtonStates();
  });
})();
