// =====================================================
// RecentMenus.gs
// เก็บเฉพาะชื่อเมนู 5 รายการล่าสุดต่อ LINE user
// ไม่อ่านหรือเขียน Google Sheets
// =====================================================

const RECENT_MENUS_PROPERTY_PREFIX =
  'recent-menus-v1:';

const RECENT_MENUS_SERVER_LIMIT =
  5;

const RECENT_MENU_NAME_MAX_LENGTH =
  200;


function getLiffRecentMenus(
  lineUserId,
  requestStartTime
) {

  try {

    return createLiffResponse(
      {
        success: true,
        menus:
          getRecentMenusForLineUser(
            lineUserId
          )
      },
      null,
      requestStartTime
    );


  } catch (error) {

    console.warn(
      'getLiffRecentMenus error: ' +
      error.message
    );


    return createLiffResponse(
      {
        success: false,
        message:
          'ไม่สามารถโหลดรายการล่าสุดได้'
      },
      null,
      requestStartTime
    );

  }

}


function clearLiffRecentMenus(
  lineUserId,
  requestStartTime
) {

  try {

    clearRecentMenusForLineUser(
      lineUserId
    );


    return createLiffResponse(
      {
        success: true
      },
      null,
      requestStartTime
    );


  } catch (error) {

    console.warn(
      'clearLiffRecentMenus error: ' +
      error.message
    );


    return createLiffResponse(
      {
        success: false,
        message:
          'ไม่สามารถล้างรายการล่าสุดได้'
      },
      null,
      requestStartTime
    );

  }

}


function getRecentMenusForLineUser(
  lineUserId
) {

  const propertyKey =
    createRecentMenusPropertyKey(
      lineUserId
    );


  const storedValue =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        propertyKey
      );


  if (!storedValue) {

    return [];

  }


  try {

    const parsedValue =
      JSON.parse(
        storedValue
      );


    return normalizeRecentMenusForServer(
      Array.isArray(
        parsedValue
      )
        ? parsedValue
        : parsedValue.menus
    );


  } catch (error) {

    console.warn(
      'Recent menus parse error: ' +
      error.message
    );


    return [];

  }

}


function clearRecentMenusForLineUser(
  lineUserId
) {

  PropertiesService
    .getScriptProperties()
    .deleteProperty(
      createRecentMenusPropertyKey(
        lineUserId
      )
    );


  return true;

}


function rememberRecentMenuForLineUser(
  lineUserId,
  menuName
) {

  const newMenus =
    normalizeRecentMenusForServer(
      [
        menuName
      ]
    );


  if (
    newMenus.length === 0
  ) {

    return false;

  }


  const lock =
    LockService.getScriptLock();


  if (
    !lock.tryLock(
      1000
    )
  ) {

    console.warn(
      'Recent menus lock unavailable'
    );


    return false;

  }


  try {

    const propertyKey =
      createRecentMenusPropertyKey(
        lineUserId
      );


    const currentMenus =
      getRecentMenusForLineUser(
        lineUserId
      );


    const nextMenus =
      normalizeRecentMenusForServer(
        newMenus.concat(
          currentMenus
        )
      );


    PropertiesService
      .getScriptProperties()
      .setProperty(
        propertyKey,
        JSON.stringify({
          menus:
            nextMenus,
          updatedAt:
            new Date().toISOString()
        })
      );


    return true;


  } finally {

    lock.releaseLock();

  }

}


function normalizeRecentMenusForServer(
  menus
) {

  if (
    !Array.isArray(
      menus
    )
  ) {

    return [];

  }


  const result =
    [];

  const usedNames =
    {};


  for (
    let index = 0;
    index < menus.length;
    index++
  ) {

    const menuName =
      String(
        menus[index] || ''
      )
        .trim()
        .slice(
          0,
          RECENT_MENU_NAME_MAX_LENGTH
        );


    const normalizedName =
      menuName
        .normalize('NFC')
        .toLowerCase()
        .replace(
          /\s+/g,
          ' '
        );


    if (
      !menuName ||
      !normalizedName ||
      usedNames[
        normalizedName
      ]
    ) {

      continue;

    }


    usedNames[
      normalizedName
    ] = true;


    result.push(
      menuName
    );


    if (
      result.length >=
        RECENT_MENUS_SERVER_LIMIT
    ) {

      break;

    }

  }


  return result;

}


function createRecentMenusPropertyKey(
  lineUserId
) {

  const digest =
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      String(
        lineUserId || ''
      ),
      Utilities.Charset.UTF_8
    );


  const userHash =
    Utilities
      .base64EncodeWebSafe(
        digest
      )
      .replace(
        /=+$/g,
        ''
      );


  return (
    RECENT_MENUS_PROPERTY_PREFIX +
    userHash
  );

}
