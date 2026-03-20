import { chromium } from 'playwright';

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function submitAnonymousPQRS({ formUrl, payload, files, headless, timeoutMs }) {
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 1100 }
  });

  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);

  try {
    await page.goto(formUrl, { waitUntil: 'domcontentloaded' });

    await setCheckedBySelector(page, '#sys_anonimo', true);

    const medioIdByKey = {
      cartelera: '#medio_de_respue0',
      correo_electronico: '#medio_de_respue1',
      correo_fisico: '#medio_de_respue2'
    };
    await setCheckedBySelector(page, medioIdByKey[payload.medioRespuesta], true);

    if (payload.correo) {
      await page.fill('#sys_email', payload.correo);
    }

    const tipoValueByKey = {
      peticion: '205',
      queja: '206',
      reclamo: '207',
      sugerencia: '208',
      denuncia: '9039'
    };
    await page.selectOption('#sys_tipo', tipoValueByKey[payload.tipoSolicitud]);

    await page.fill('#asunto', payload.asunto);
    await page.fill('#descripci_n', payload.descripcion);

    await setCheckedBySelector(page, '#sys_tratamiento', true);

    if (files.length > 0) {
      const input = page.locator('#dropzone_sys_anexos input[type="file"]').first();
      await input.setInputFiles(files.map((f) => f.path));

      const uploadedCount = page.locator('#dropzone_sys_anexos .dz-success-mark');
      await uploadedCount.first().waitFor({ state: 'visible' });
    }

    const submitResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/pqr/captcha/saveDocument') &&
        response.request().method() === 'POST',
      { timeout: timeoutMs }
    );

    await page.click('#save_document');
    const submitResponse = await submitResponsePromise;

    const submitJson = await submitResponse.json();
    if (!submitJson?.success) {
      throw new Error(submitJson?.message || 'El portal rechazo la solicitud de radicacion');
    }

    const titleText = `Numero Consecutivo: ${submitJson?.data?.number ?? ''}`.trim();
    const bodyText = `${submitJson?.data?.messageBody ?? ''}`.trim();

    const consecutiveMatch = String(submitJson?.data?.number || '').match(/(\d+)/) || titleText.match(/(\d+)/);
    const radicadoMatch = bodyText.match(/radicado\s+([A-Za-z0-9\-]+)/i);

    if (!consecutiveMatch) {
      throw new Error(`No se pudo extraer el consecutivo. title=${titleText}`);
    }

    return {
      consecutive: consecutiveMatch[1],
      radicado: radicadoMatch ? radicadoMatch[1] : null,
      title: titleText,
      messageBody: bodyText
    };
  } catch (error) {
    const screenshotPath = `./failure-${Date.now()}.png`;
    try {
      await page.screenshot({ path: screenshotPath, fullPage: true });
    } catch {
      // Ignore screenshot failures.
    }
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function setCheckedBySelector(page, selector, checked) {
  await page.waitForSelector(selector, { state: 'attached' });
  await page.evaluate(
    ({ cssSelector, shouldCheck }) => {
      const element = document.querySelector(cssSelector);
      if (!element) {
        throw new Error(`No se encontro elemento ${cssSelector}`);
      }

      element.checked = shouldCheck;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { cssSelector: selector, shouldCheck: checked }
  );
}
